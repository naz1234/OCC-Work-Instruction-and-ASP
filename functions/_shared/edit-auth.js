const cookieName = "occ_edit_session"; 
const sessionLifetimeSeconds = 8 * 60 * 60;

function configuredPassword(env) {
  return typeof env?.EDIT_PASSWORD === "string" ? env.EDIT_PASSWORD : "";
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function cookieValue(request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) return valueParts.join("=");
  }
  return "";
}

async function passwordMatches(input, expected) {
  const [inputHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  return constantTimeEqual(
    bytesToBase64Url(new Uint8Array(inputHash)),
    bytesToBase64Url(new Uint8Array(expectedHash)),
  );
}

async function createSessionToken(secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = nowSeconds + sessionLifetimeSeconds;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, secret)}`;
}

async function hasValidEditSession(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const secret = configuredPassword(env);
  if (!secret) return false;

  const token = cookieValue(request);
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAtText = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt <= nowSeconds) return false;
  if (expiresAt > nowSeconds + sessionLifetimeSeconds) return false;

  const expectedSignature = await sign(expiresAtText, secret);
  return constantTimeEqual(suppliedSignature, expectedSignature);
}

async function requireEditSession(request, env) {
  if (!configuredPassword(env)) {
    return {
      ok: false,
      status: 503,
      error: "Edit mode is not configured. Add the EDIT_PASSWORD secret in Cloudflare Pages.",
    };
  }
  if (!(await hasValidEditSession(request, env))) {
    return { ok: false, status: 401, error: "Unlock edit mode to make this change." };
  }
  return { ok: true };
}

function sessionCookie(token) {
  return `${cookieName}=${token}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export {
  configuredPassword,
  createSessionToken,
  expiredSessionCookie,
  hasValidEditSession,
  passwordMatches,
  requireEditSession,
  sessionCookie,
  sessionLifetimeSeconds,
};
