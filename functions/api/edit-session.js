import {
  configuredPassword,
  createSessionToken,
  expiredSessionCookie,
  hasValidEditSession,
  passwordMatches,
  sessionCookie,
  sessionLifetimeSeconds,
} from "../_shared/edit-auth.js";

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

export async function onRequest(context) {
  const password = configuredPassword(context.env);

  if (context.request.method === "GET") {
    if (!password) {
      return json(
        { authenticated: false, error: "Add the EDIT_PASSWORD secret in Cloudflare Pages." },
        503,
      );
    }
    return json({ authenticated: await hasValidEditSession(context.request, context.env) });
  }

  if (context.request.method === "POST") {
    if (!password) {
      return json({ error: "Add the EDIT_PASSWORD secret in Cloudflare Pages." }, 503);
    }
    const contentLength = Number(context.request.headers.get("content-length") || 0);
    if (contentLength > 1024) return json({ error: "The request is too large." }, 413);

    let input;
    try {
      input = await context.request.json();
    } catch {
      return json({ error: "Enter the edit-mode password." }, 400);
    }
    const suppliedPassword = typeof input?.password === "string" ? input.password : "";
    if (!(await passwordMatches(suppliedPassword, password))) {
      return json({ error: "Incorrect password." }, 401);
    }

    const token = await createSessionToken(password);
    return json(
      { authenticated: true, expiresIn: sessionLifetimeSeconds },
      200,
      { "Set-Cookie": sessionCookie(token) },
    );
  }

  if (context.request.method === "DELETE") {
    return json(
      { authenticated: false },
      200,
      { "Set-Cookie": expiredSessionCookie() },
    );
  }

  return json({ error: "Method not allowed." }, 405);
}
