const maxPdfBytes = 25 * 1024 * 1024;
const maxRequestBytes = maxPdfBytes + 1024 * 1024;
const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function validDocumentId(id) {
  return /^(?:reference-[a-z0-9-]{1,180}|row-\d+)$/.test(id);
}

function safeFileName(value) {
  const cleaned = String(value || "work-instruction.pdf")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
    .trim()
    .slice(0, 180);
  return cleaned.toLocaleLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "work-instruction"}.pdf`;
}

function hasPdfSignature(buffer) {
  if (buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer, 0, 5);
  return String.fromCharCode(...bytes) === "%PDF-";
}

async function listPdfs(database) {
  const { results = [] } = await database
    .prepare(
      `SELECT document_key AS id,
              file_name AS fileName,
              size_bytes AS sizeBytes,
              uploaded_at AS uploadedAt
         FROM wi_pdfs
        ORDER BY document_key`,
    )
    .all();
  return results;
}

async function servePdf(request, database, bucket, id) {
  if (!validDocumentId(id)) return json({ error: "The document identifier is invalid." }, 400);

  const metadata = await database
    .prepare(
      `SELECT object_key AS objectKey, file_name AS fileName
         FROM wi_pdfs
        WHERE document_key = ?`,
    )
    .bind(id)
    .first();
  if (!metadata) return json({ error: "No WI PDF has been uploaded for this document." }, 404);

  const object = await bucket.get(metadata.objectKey);
  if (!object) return json({ error: "The stored WI PDF could not be found." }, 404);

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`,
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.size !== undefined) headers.set("Content-Length", String(object.size));
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

async function uploadPdf(request, database, bucket) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxRequestBytes) return json({ error: "The PDF must be 25 MB or smaller." }, 413);
  if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("multipart/form-data")) {
    return json({ error: "Upload the PDF using multipart form data." }, 415);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "The PDF upload could not be read." }, 400);
  }

  const id = String(form.get("id") || "").trim();
  const file = form.get("file");
  if (!validDocumentId(id)) return json({ error: "The document identifier is invalid." }, 400);
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string") {
    return json({ error: "Choose a PDF file." }, 400);
  }
  if (!file.name.toLocaleLowerCase().endsWith(".pdf")) {
    return json({ error: "Only PDF files are allowed." }, 400);
  }
  if (file.size > maxPdfBytes) return json({ error: "The PDF must be 25 MB or smaller." }, 413);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > maxPdfBytes) return json({ error: "The PDF must be 25 MB or smaller." }, 413);
  if (!hasPdfSignature(buffer)) return json({ error: "The selected file is not a valid PDF." }, 400);

  const fileName = safeFileName(file.name);
  const uploadedAt = new Date().toISOString();
  const objectKey = `wi-pdfs/${id}/${crypto.randomUUID()}.pdf`;
  const previous = await database
    .prepare("SELECT object_key AS objectKey FROM wi_pdfs WHERE document_key = ?")
    .bind(id)
    .first();

  await bucket.put(objectKey, buffer, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { documentId: id, fileName },
  });

  try {
    await database
      .prepare(
        `INSERT INTO wi_pdfs (document_key, object_key, file_name, size_bytes, uploaded_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(document_key) DO UPDATE SET
           object_key = excluded.object_key,
           file_name = excluded.file_name,
           size_bytes = excluded.size_bytes,
           uploaded_at = excluded.uploaded_at`,
      )
      .bind(id, objectKey, fileName, buffer.byteLength, uploadedAt)
      .run();
  } catch {
    await bucket.delete(objectKey).catch(() => {});
    return json({ error: "The WI PDF metadata could not be saved." }, 500);
  }

  if (previous?.objectKey && previous.objectKey !== objectKey) {
    await bucket.delete(previous.objectKey).catch(() => {});
  }

  return json({ pdf: { id, fileName, sizeBytes: buffer.byteLength, uploadedAt } });
}

export async function onRequest(context) {
  const database = context.env.OCC_LINKS;
  if (!database) return json({ error: "The OCC_LINKS D1 binding is not configured." }, 503);

  if (context.request.method === "GET") {
    const id = new URL(context.request.url).searchParams.get("id");
    try {
      if (id) {
        if (!context.env.WI_PDFS) return json({ error: "The WI_PDFS R2 binding is not configured." }, 503);
        return await servePdf(context.request, database, context.env.WI_PDFS, id);
      }
      return json({ pdfs: await listPdfs(database) });
    } catch {
      return json({ error: "WI PDF data could not be loaded." }, 500);
    }
  }

  if (context.request.method === "PUT") {
    if (!context.env.WI_PDFS) return json({ error: "The WI_PDFS R2 binding is not configured." }, 503);
    try {
      return await uploadPdf(context.request, database, context.env.WI_PDFS);
    } catch {
      return json({ error: "The WI PDF could not be uploaded." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
}

export { hasPdfSignature, safeFileName, validDocumentId };
