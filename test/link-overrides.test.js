import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "../functions/_shared/edit-auth.js";
import { onRequest, validateOverride } from "../functions/api/link-overrides.js";

const editPassword = "test-edit-password";

async function editCookie() {
  return `occ_edit_session=${await createSessionToken(editPassword)}`;
}

class FakeDatabase {
  constructor() {
    this.rows = new Map();
  }

  prepare(sql) {
    const database = this;
    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async all() {
        return {
          results: [...database.rows.values()].sort((left, right) => left.id.localeCompare(right.id)),
        };
      },
      async run() {
        const [id, title, url, updatedAt] = this.values;
        database.rows.set(id, { id, title, url, updatedAt });
        return { success: true };
      },
    };
  }
}

test("validates hyperlink title and protocol", () => {
  assert.deepEqual(validateOverride({ id: "reference-ope-fc-001-01", title: "OPE-FC-001-01", url: "https://example.com" }).value, {
    id: "reference-ope-fc-001-01",
    title: "OPE-FC-001-01",
    url: "https://example.com",
  });
  assert.match(validateOverride({ id: "row-7", title: "Reference", url: "javascript:alert(1)" }).error, /http/);
  assert.match(validateOverride({ id: "invalid", title: "Reference", url: "" }).error, /identifier/);
});

test("saves and returns shared hyperlink overrides", async () => {
  const database = new FakeDatabase();
  const cookie = await editCookie();
  const putResponse = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/link-overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ id: "reference-ope-fc-001-01", title: "Updated reference", url: "https://example.com/doc" }),
    }),
  });
  assert.equal(putResponse.status, 200);

  const getResponse = await onRequest({
    env: { OCC_LINKS: database },
    request: new Request("https://example.com/api/link-overrides"),
  });
  assert.equal(getResponse.status, 200);
  assert.deepEqual((await getResponse.json()).overrides.map(({ id, title, url }) => ({ id, title, url })), [
    { id: "reference-ope-fc-001-01", title: "Updated reference", url: "https://example.com/doc" },
  ]);
});

test("rejects hyperlink changes outside edit mode", async () => {
  const response = await onRequest({
    env: { OCC_LINKS: new FakeDatabase(), EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/link-overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "row-7", title: "Reference", url: "" }),
    }),
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unlock edit mode/);
});

test("reports a missing Cloudflare D1 binding", async () => {
  const response = await onRequest({
    env: {},
    request: new Request("https://example.com/api/link-overrides"),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OCC_LINKS/);
});
