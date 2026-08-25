import assert from "node:assert/strict";
import test from "node:test";

import { onRequest, safeFileName } from "../functions/api/wi-pdfs.js";

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
        return { results: [...database.rows.values()].sort((a, b) => a.id.localeCompare(b.id)) };
      },
      async first() {
        const row = database.rows.get(this.values[0]);
        if (!row) return null;
        if (sql.includes("object_key AS objectKey, file_name AS fileName")) {
          return { objectKey: row.objectKey, fileName: row.fileName };
        }
        return { objectKey: row.objectKey };
      },
      async run() {
        const [id, objectKey, fileName, sizeBytes, uploadedAt] = this.values;
        database.rows.set(id, { id, objectKey, fileName, sizeBytes, uploadedAt });
        return { success: true };
      },
    };
  }
}

class FakeBucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value) {
    const body = new Uint8Array(value);
    this.objects.set(key, { body, size: body.byteLength, httpEtag: '"test-etag"' });
  }

  async get(key) {
    return this.objects.get(key) || null;
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

function uploadRequest(file) {
  const form = new FormData();
  form.append("id", "reference-ope-in-095-01");
  form.append("file", file);
  return new Request("https://example.com/api/wi-pdfs", { method: "PUT", body: form });
}

test("sanitizes uploaded PDF filenames", () => {
  assert.equal(safeFileName("../OCC\\Instruction.pdf"), "..-OCC-Instruction.pdf");
  assert.equal(safeFileName("instruction"), "instruction.pdf");
});

test("uploads, lists, and serves a shared WI PDF", async () => {
  const database = new FakeDatabase();
  const bucket = new FakeBucket();
  const file = new File([new TextEncoder().encode("%PDF-1.7\nTest")], "OPE-IN-095-01.pdf", {
    type: "application/pdf",
  });

  const upload = await onRequest({
    env: { OCC_LINKS: database, WI_PDFS: bucket },
    request: uploadRequest(file),
  });
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).pdf.fileName, "OPE-IN-095-01.pdf");

  const list = await onRequest({
    env: { OCC_LINKS: database, WI_PDFS: bucket },
    request: new Request("https://example.com/api/wi-pdfs"),
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).pdfs.length, 1);

  const view = await onRequest({
    env: { OCC_LINKS: database, WI_PDFS: bucket },
    request: new Request("https://example.com/api/wi-pdfs?id=reference-ope-in-095-01"),
  });
  assert.equal(view.status, 200);
  assert.equal(view.headers.get("content-type"), "application/pdf");
  assert.equal(new TextDecoder().decode(await view.arrayBuffer()), "%PDF-1.7\nTest");
});

test("rejects a renamed non-PDF file", async () => {
  const response = await onRequest({
    env: { OCC_LINKS: new FakeDatabase(), WI_PDFS: new FakeBucket() },
    request: uploadRequest(new File(["not a pdf"], "fake.pdf", { type: "application/pdf" })),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid PDF/);
});

test("reports a missing R2 binding", async () => {
  const response = await onRequest({
    env: { OCC_LINKS: new FakeDatabase() },
    request: uploadRequest(new File(["%PDF-"], "test.pdf", { type: "application/pdf" })),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /WI_PDFS/);
});
