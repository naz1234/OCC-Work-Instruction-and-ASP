import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/edit-session.js";

const editPassword = "test-edit-password";

test("unlocks and validates an HTTP-only edit session", async () => {
  const login = await onRequest({
    env: { EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/edit-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: editPassword }),
    }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /occ_edit_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);

  const status = await onRequest({
    env: { EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/edit-session", {
      headers: { Cookie: setCookie.split(";")[0] },
    }),
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).authenticated, true);
});

test("rejects an incorrect edit-mode password", async () => {
  const response = await onRequest({
    env: { EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/edit-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "incorrect" }),
    }),
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Incorrect password/);
});

test("reports a missing edit password secret", async () => {
  const response = await onRequest({
    env: {},
    request: new Request("https://example.com/api/edit-session"),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /EDIT_PASSWORD/);
});
