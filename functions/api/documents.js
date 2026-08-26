import { requireEditSession } from "../_shared/edit-auth.js";

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function validDocumentId(id) {
  return /^(?:reference-[a-z0-9-]{1,180}|row-\d+|custom-[0-9a-f-]{36})$/.test(id);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateDocument(input) {
  const document = {
    title: cleanText(input?.title),
    reference: cleanText(input?.reference),
    line: cleanText(input?.line),
    condition: cleanText(input?.condition),
    folder: cleanText(input?.folder),
    group: cleanText(input?.group),
    linkTitle: cleanText(input?.linkTitle),
    url: cleanText(input?.url),
  };

  const required = [
    ["title", 300, "Enter the document title."],
    ["reference", 200, "Enter the reference number."],
    ["line", 100, "Enter the applicable line or lines."],
    ["condition", 80, "Choose a condition."],
    ["folder", 80, "Enter the EDMS folder."],
    ["group", 200, "Choose a document group."],
  ];
  for (const [field, maximum, emptyError] of required) {
    if (!document[field]) return { error: emptyError };
    if (document[field].length > maximum) {
      return { error: `${field === "title" ? "The document title" : `The ${field}`} is too long.` };
    }
  }
  if (document.linkTitle.length > 200) {
    return { error: "The hyperlink title must be 200 characters or fewer." };
  }
  if (document.url.length > 2048) {
    return { error: "The hyperlink URL must be 2,048 characters or fewer." };
  }
  if (document.url) {
    try {
      const parsed = new URL(document.url);
      if (!(["http:", "https:"].includes(parsed.protocol))) {
        return { error: "The hyperlink must use http:// or https://." };
      }
    } catch {
      return { error: "Enter a complete hyperlink URL." };
    }
  }

  if (!document.linkTitle) document.linkTitle = document.reference;
  return { value: document };
}

function validateDocumentAssignment(input) {
  const id = cleanText(input?.id);
  const condition = cleanText(input?.condition);
  const lines = [
    ...new Set(
      cleanText(input?.line)
        .split(",")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => Number(left) - Number(right));

  if (!validDocumentId(id)) return { error: "The document identifier is invalid." };
  if (!lines.length) return { error: "Choose at least one line." };
  if (lines.some((line) => !["3", "4", "5", "6"].includes(line))) {
    return { error: "Lines must be selected from 3, 4, 5, and 6." };
  }
  if (!["Normal", "Degraded", "Emergency"].includes(condition)) {
    return { error: "Choose a valid condition." };
  }

  return { value: { id, line: lines.join(","), condition } };
}

async function ensureDocumentOverridesTable(database) {
  await database
    .prepare(
      `CREATE TABLE IF NOT EXISTS document_overrides (
         document_key TEXT PRIMARY KEY,
         line TEXT NOT NULL,
         condition TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
    )
    .run();
}

async function listDocumentChanges(database) {
  const [customResult, removedResult] = await Promise.all([
    database
      .prepare(
        `SELECT document_key AS id,
                title,
                reference,
                line,
                condition,
                folder,
                group_name AS "group",
                link_title AS linkTitle,
                url,
                created_at AS createdAt
           FROM custom_documents
          ORDER BY created_at, document_key`,
      )
      .all(),
    database
      .prepare(
        `SELECT document_key AS id
           FROM removed_documents
          ORDER BY document_key`,
      )
      .all(),
  ]);
  let assignmentResult = { results: [] };
  try {
    assignmentResult = await database
      .prepare(
        `SELECT document_key AS id,
                line,
                condition,
                updated_at AS updatedAt
           FROM document_overrides
          ORDER BY document_key`,
      )
      .all();
  } catch {
    // Existing deployments remain readable until the new table is created by migration or first edit.
  }
  return {
    documents: customResult.results || [],
    removedIds: (removedResult.results || []).map((row) => row.id),
    assignmentOverrides: assignmentResult.results || [],
  };
}

async function addDocument(database, input) {
  const validation = validateDocument(input);
  if (validation.error) return { error: validation.error, status: 400 };

  const document = validation.value;
  const id = `custom-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  try {
    await database
      .prepare(
        `INSERT INTO custom_documents
           (document_key, title, reference, line, condition, folder, group_name, link_title, url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        document.title,
        document.reference,
        document.line,
        document.condition,
        document.folder,
        document.group,
        document.linkTitle,
        document.url,
        createdAt,
      )
      .run();
  } catch {
    return { error: "The new work instruction could not be saved.", status: 500 };
  }
  return { document: { id, ...document, createdAt } };
}

async function updateDocumentAssignment(database, input) {
  const validation = validateDocumentAssignment(input);
  if (validation.error) return { error: validation.error, status: 400 };

  const override = { ...validation.value, updatedAt: new Date().toISOString() };
  try {
    await ensureDocumentOverridesTable(database);
    await database
      .prepare(
        `INSERT INTO document_overrides (document_key, line, condition, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(document_key) DO UPDATE SET
           line = excluded.line,
           condition = excluded.condition,
           updated_at = excluded.updated_at`,
      )
      .bind(override.id, override.line, override.condition, override.updatedAt)
      .run();
  } catch {
    return { error: "The line and condition could not be saved.", status: 500 };
  }
  return { override };
}

async function removeDocument(database, bucket, id) {
  if (!validDocumentId(id)) {
    return { error: "The document identifier is invalid.", status: 400 };
  }

  const pdf = await database
    .prepare("SELECT object_key AS objectKey FROM wi_pdfs WHERE document_key = ?")
    .bind(id)
    .first();
  if (pdf?.objectKey && !bucket) {
    return { error: "The WI_PDFS R2 binding is required to remove this document.", status: 503 };
  }

  try {
    await ensureDocumentOverridesTable(database);
  } catch {
    return { error: "The work instruction could not be removed.", status: 500 };
  }

  const statements = [];
  if (id.startsWith("custom-")) {
    statements.push(database.prepare("DELETE FROM custom_documents WHERE document_key = ?").bind(id));
  } else {
    statements.push(
      database
        .prepare(
          `INSERT INTO removed_documents (document_key, removed_at)
           VALUES (?, ?)
           ON CONFLICT(document_key) DO UPDATE SET removed_at = excluded.removed_at`,
        )
        .bind(id, new Date().toISOString()),
    );
  }
  statements.push(
    database.prepare("DELETE FROM link_overrides WHERE document_key = ?").bind(id),
    database.prepare("DELETE FROM wi_pdfs WHERE document_key = ?").bind(id),
    database.prepare("DELETE FROM document_overrides WHERE document_key = ?").bind(id),
  );

  try {
    await database.batch(statements);
  } catch {
    return { error: "The work instruction could not be removed.", status: 500 };
  }
  if (pdf?.objectKey) await bucket.delete(pdf.objectKey).catch(() => {});
  return { id };
}

export async function onRequest(context) {
  const database = context.env.OCC_LINKS;
  if (!database) return json({ error: "The OCC_LINKS D1 binding is not configured." }, 503);

  if (context.request.method === "GET") {
    try {
      return json(await listDocumentChanges(database));
    } catch {
      return json({ error: "Shared document changes could not be loaded." }, 500);
    }
  }

  if (context.request.method === "POST") {
    const authorization = await requireEditSession(context.request, context.env);
    if (!authorization.ok) return json({ error: authorization.error }, authorization.status);
    const contentLength = Number(context.request.headers.get("content-length") || 0);
    if (contentLength > 8192) return json({ error: "The request is too large." }, 413);

    let input;
    try {
      input = await context.request.json();
    } catch {
      return json({ error: "The request must contain valid JSON." }, 400);
    }
    const result = await addDocument(database, input);
    return result.error ? json({ error: result.error }, result.status) : json(result, 201);
  }

  if (context.request.method === "PUT") {
    const authorization = await requireEditSession(context.request, context.env);
    if (!authorization.ok) return json({ error: authorization.error }, authorization.status);
    const contentLength = Number(context.request.headers.get("content-length") || 0);
    if (contentLength > 8192) return json({ error: "The request is too large." }, 413);

    let input;
    try {
      input = await context.request.json();
    } catch {
      return json({ error: "The request must contain valid JSON." }, 400);
    }
    const result = await updateDocumentAssignment(database, input);
    return result.error ? json({ error: result.error }, result.status) : json(result);
  }

  if (context.request.method === "DELETE") {
    const authorization = await requireEditSession(context.request, context.env);
    if (!authorization.ok) return json({ error: authorization.error }, authorization.status);
    const id = new URL(context.request.url).searchParams.get("id") || "";
    try {
      const result = await removeDocument(database, context.env.WI_PDFS, id);
      return result.error ? json({ error: result.error }, result.status) : json(result);
    } catch {
      return json({ error: "The work instruction could not be removed." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
}

export { validDocumentId, validateDocument, validateDocumentAssignment };
