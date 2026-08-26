import { requireEditSession } from "../_shared/edit-auth.js";

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function validateOverride(input) {
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const url = typeof input?.url === "string" ? input.url.trim() : "";

  if (!/^(?:reference-[a-z0-9-]{1,180}|row-\d+|custom-[0-9a-f-]{36})$/.test(id)) {
    return { error: "The document identifier is invalid." };
  }
  if (!title) return { error: "Enter a hyperlink title." };
  if (title.length > 200) return { error: "The hyperlink title must be 200 characters or fewer." };
  if (url.length > 2048) return { error: "The hyperlink URL must be 2,048 characters or fewer." };

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { error: "The hyperlink must use http:// or https://." };
      }
    } catch {
      return { error: "Enter a complete hyperlink URL." };
    }
  }

  return { value: { id, title, url } };
}

async function listOverrides(database) {
  const query = database.prepare(
    `SELECT document_key AS id,
            link_title AS title,
            url,
            updated_at AS updatedAt
       FROM link_overrides
      ORDER BY document_key`,
  );
  const { results = [] } = await query.all();
  return results;
}

async function saveOverride(database, override) {
  const updatedAt = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO link_overrides (document_key, link_title, url, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(document_key) DO UPDATE SET
         link_title = excluded.link_title,
         url = excluded.url,
         updated_at = excluded.updated_at`,
    )
    .bind(override.id, override.title, override.url, updatedAt)
    .run();

  return { ...override, updatedAt };
}

export async function onRequest(context) {
  const database = context.env.OCC_LINKS;
  if (!database) {
    return json(
      { error: "Shared link storage is not configured. Add the OCC_LINKS D1 binding in Cloudflare Pages." },
      503,
    );
  }

  if (context.request.method === "GET") {
    try {
      return json({ overrides: await listOverrides(database) });
    } catch {
      return json({ error: "Shared hyperlinks could not be loaded." }, 500);
    }
  }

  if (context.request.method === "PUT") {
    const authorization = await requireEditSession(context.request, context.env);
    if (!authorization.ok) return json({ error: authorization.error }, authorization.status);
    const contentLength = Number(context.request.headers.get("content-length") || 0);
    if (contentLength > 4096) return json({ error: "The request is too large." }, 413);

    let input;
    try {
      input = await context.request.json();
    } catch {
      return json({ error: "The request must contain valid JSON." }, 400);
    }

    const validation = validateOverride(input);
    if (validation.error) return json({ error: validation.error }, 400);

    try {
      const override = await saveOverride(database, validation.value);
      return json({ override });
    } catch {
      return json({ error: "The shared hyperlink could not be saved." }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405);
}

export { validateOverride };
