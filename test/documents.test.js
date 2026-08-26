import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "../functions/_shared/edit-auth.js";
import {
  onRequest,
  validateDocument,
  validateDocumentAssignment,
  validateDocumentRename,
} from "../functions/api/documents.js";

const editPassword = "test-edit-password";

class FakeDatabase {
  constructor() {
    this.custom = new Map();
    this.removed = new Map();
    this.pdfs = new Map();
    this.assignments = new Map();
    this.textOverrides = new Map();
  }

  prepare(sql) {
    const database = this;
    return {
      sql,
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async all() {
        if (sql.includes("FROM custom_documents")) {
          return {
            results: [...database.custom.values()].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            ),
          };
        }
        if (sql.includes("FROM removed_documents")) {
          return { results: [...database.removed.keys()].sort().map((id) => ({ id })) };
        }
        if (sql.includes("FROM document_overrides")) {
          return { results: [...database.assignments.values()].sort((a, b) => a.id.localeCompare(b.id)) };
        }
        if (sql.includes("FROM document_text_overrides")) {
          return { results: [...database.textOverrides.values()].sort((a, b) => a.id.localeCompare(b.id)) };
        }
        return { results: [] };
      },
      async first() {
        if (sql.includes("FROM wi_pdfs")) return database.pdfs.get(this.values[0]) || null;
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO custom_documents")) {
          const [id, title, reference, line, condition, folder, group, linkTitle, url, createdAt] =
            this.values;
          database.custom.set(id, {
            id,
            title,
            reference,
            line,
            condition,
            folder,
            group,
            linkTitle,
            url,
            createdAt,
          });
        } else if (sql.includes("DELETE FROM custom_documents")) {
          database.custom.delete(this.values[0]);
        } else if (sql.includes("INSERT INTO removed_documents")) {
          database.removed.set(this.values[0], this.values[1]);
        } else if (sql.includes("INSERT INTO document_overrides")) {
          const [id, line, condition, updatedAt] = this.values;
          database.assignments.set(id, { id, line, condition, updatedAt });
        } else if (sql.includes("INSERT INTO document_text_overrides")) {
          const [id, value, updatedAt] = this.values;
          const current = database.textOverrides.get(id) || { id, title: null, folder: null };
          const field = sql.includes("document_key, title") ? "title" : "folder";
          database.textOverrides.set(id, { ...current, [field]: value, updatedAt });
        } else if (sql.includes("DELETE FROM wi_pdfs")) {
          database.pdfs.delete(this.values[0]);
        } else if (sql.includes("DELETE FROM document_overrides")) {
          database.assignments.delete(this.values[0]);
        } else if (sql.includes("DELETE FROM document_text_overrides")) {
          database.textOverrides.delete(this.values[0]);
        }
        return { success: true };
      },
    };
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

async function authorizedRequest(url, options = {}) {
  const token = await createSessionToken(editPassword);
  const headers = new Headers(options.headers || {});
  headers.set("Cookie", `occ_edit_session=${token}`);
  return new Request(url, { ...options, headers });
}

const exampleDocument = {
  title: "New OCC Work Instruction",
  reference: "OPE-IN-999-01",
  line: "3,4,5,6",
  condition: "Normal",
  folder: "OCC",
  group: "Generic Documents For All Lines",
  linkTitle: "OPE-IN-999-01",
  url: "https://example.com/wi",
};

test("validates a new work instruction and its hyperlink", () => {
  assert.deepEqual(validateDocument(exampleDocument).value, exampleDocument);
  assert.match(validateDocument({ ...exampleDocument, url: "javascript:alert(1)" }).error, /http/);
  assert.match(validateDocument({ ...exampleDocument, title: "" }).error, /title/);
});

test("validates and normalizes editable lines and conditions", () => {
  assert.deepEqual(
    validateDocumentAssignment({ id: "row-7", line: "6,4,4,3", condition: "Emergency" }).value,
    { id: "row-7", line: "3,4,6", condition: "Emergency" },
  );
  assert.match(
    validateDocumentAssignment({ id: "row-7", line: "2,3", condition: "Normal" }).error,
    /3, 4, 5, and 6/,
  );
  assert.match(
    validateDocumentAssignment({ id: "row-7", line: "3", condition: "Unknown" }).error,
    /valid condition/,
  );
});

test("validates document title and EDMS folder renames", () => {
  assert.deepEqual(
    validateDocumentRename({ id: "row-7", field: "title", value: "  Updated title  " }).value,
    { id: "row-7", field: "title", value: "Updated title" },
  );
  assert.match(
    validateDocumentRename({ id: "row-7", field: "folder", value: "" }).error,
    /EDMS folder/,
  );
  assert.match(
    validateDocumentRename({ id: "row-7", field: "reference", value: "Test" }).error,
    /valid field/,
  );
});

test("adds, lists, and removes a custom work instruction", async () => {
  const database = new FakeDatabase();
  const add = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: await authorizedRequest("https://example.com/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exampleDocument),
    }),
  });
  assert.equal(add.status, 201);
  const added = (await add.json()).document;
  assert.match(added.id, /^custom-/);

  const list = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents"),
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).documents[0].reference, exampleDocument.reference);

  const remove = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: await authorizedRequest(
      `https://example.com/api/documents?id=${encodeURIComponent(added.id)}`,
      { method: "DELETE" },
    ),
  });
  assert.equal(remove.status, 200);
  assert.equal(database.custom.size, 0);
});

test("records a removed built-in work instruction for every device", async () => {
  const database = new FakeDatabase();
  database.assignments.set("row-7", {
    id: "row-7",
    line: "3",
    condition: "Normal",
    updatedAt: new Date().toISOString(),
  });
  database.textOverrides.set("row-7", {
    id: "row-7",
    title: "Renamed title",
    folder: "OCC",
    updatedAt: new Date().toISOString(),
  });
  const response = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: await authorizedRequest("https://example.com/api/documents?id=row-7", {
      method: "DELETE",
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(database.removed.has("row-7"), true);
  assert.equal(database.assignments.has("row-7"), false);
  assert.equal(database.textOverrides.has("row-7"), false);
});

test("updates and lists a built-in work instruction line and condition", async () => {
  const database = new FakeDatabase();
  const update = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: await authorizedRequest("https://example.com/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "row-7", line: "6,4", condition: "Degraded" }),
    }),
  });
  assert.equal(update.status, 200);
  assert.deepEqual((await update.json()).override.line, "4,6");

  const list = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents"),
  });
  const payload = await list.json();
  assert.equal(payload.assignmentOverrides[0].condition, "Degraded");
});

test("renames and lists a document title and EDMS folder", async () => {
  const database = new FakeDatabase();
  for (const [field, value] of [
    ["title", "Updated OCC Work Instruction"],
    ["folder", "STA"],
  ]) {
    const update = await onRequest({
      env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
      request: await authorizedRequest("https://example.com/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", id: "row-7", field, value }),
      }),
    });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).override[field], value);
  }

  const list = await onRequest({
    env: { OCC_LINKS: database, EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents"),
  });
  const payload = await list.json();
  assert.equal(payload.textOverrides[0].title, "Updated OCC Work Instruction");
  assert.equal(payload.textOverrides[0].folder, "STA");
});

test("rejects document changes outside edit mode", async () => {
  const response = await onRequest({
    env: { OCC_LINKS: new FakeDatabase(), EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exampleDocument),
    }),
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unlock edit mode/);

  const assignmentResponse = await onRequest({
    env: { OCC_LINKS: new FakeDatabase(), EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "row-7", line: "3", condition: "Normal" }),
    }),
  });
  assert.equal(assignmentResponse.status, 401);

  const renameResponse = await onRequest({
    env: { OCC_LINKS: new FakeDatabase(), EDIT_PASSWORD: editPassword },
    request: new Request("https://example.com/api/documents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: "row-7", field: "title", value: "Test" }),
    }),
  });
  assert.equal(renameResponse.status, 401);
});
