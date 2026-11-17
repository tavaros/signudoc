import assert from "node:assert/strict";
import test from "node:test";

import { PDFDocument } from "pdf-lib";

import {
  describePdfPreviewFailure,
  LOCKED_PDF_MESSAGE,
  PREVIEW_UNAVAILABLE_MESSAGE,
} from "./pdf-preview-error.ts";

// A one-page PDF that needs the password "demo-user" to open (AES-256).
const PASSWORD_PDF_BASE64 =
  "JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDhlMjlhMmMyYTUwZjViYjUwNTFkZjhhOWEzNmZlODgyMTMzZDNmMmJiN2M4OTgyNTUyMmQ3ZGFkOGEwYmY5MzQ+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViA1Ci9SIDYKL0xlbmd0aCAyNTYKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MmRhZTg3MThkOTdhMTE3OGQ5M2JlNTk3MTgzZTc4MWRiNmUwNDkwMzliZmQyNzYzMGI3MDI0MTFmY2UzMjY2YTExYzFkZTdlNjNjNjZjMmI2OTI3YTc5OTYxMjQ4N2EzPgovVSA8Mjk0N2JiY2NjM2ZjMzVjOTAzZDAyYmMxMDc4OWM4YzdiMWEzNDZiNzAzMGVmNzhhNzI3OTE2YjljNjg0Y2JjMTYxM2I1ZDVlNmEwZjI2ZDU5YWRmMzRkZDJmZDg5OWYzPgovQ0YgPDwKL1N0ZENGIDw8Ci9BdXRoRXZlbnQgL0RvY09wZW4KL0NGTSAvQUVTVjMKL0xlbmd0aCAzMgo+Pgo+PgovU3RtRiAvU3RkQ0YKL1N0ckYgL1N0ZENGCi9PRSA8MTY3YmZlMzgwMDczOGVjNGZjZjBhNjY0ZmJjY2E5YTg5NDA1M2YxYzMxZDdiYzIyNGNhMjNkNzM3MjBhNTQ4ZD4KL1VFIDw5OTY4ZTIwZjdhNWE0ZmE0YjU1NzYxOWNmNzljMGZhMGRhNWYyOTNmMjA3MzgzM2RlN2M5NDJlMWRjOWM4NDBmPgovUGVybXMgPDYxNGVlYjdiZmFhNDIxNWUzZDFlMWM5ZWY5MTgxMjAzPgo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMTMgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjIxIDAwMDAwIG4gCjAwMDAwMDAzMTUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDMgMCBSCi9JbmZvIDEgMCBSCi9JRCBbIDwzNTYxMzEzMjYyMzc2NDM3MzgzNTYxMzY2NDM1MzUzNzM1MzYzOTYyNjIzNzMwNjQzMjM0MzIzMjYxMzczMDM5PiA8MzU2MTMxMzI2MjM3NjQzNzM4MzU2MTM2NjQzNTM1MzczNTM2Mzk2MjYyMzczMDY0MzIzNDMyMzI2MTM3MzAzOT4gXQovRW5jcnlwdCA1IDAgUgo+PgpzdGFydHhyZWYKODcwCiUlRU9GCg==";

async function openWithPdfJs(bytes: Uint8Array): Promise<unknown> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0 });

  try {
    const document = await task.promise;

    await document.destroy();

    return null;
  } catch (error) {
    return error;
  } finally {
    await task.destroy();
  }
}

test("a PDF that needs a password to open is named as locked (issue #54)", async () => {
  const error = await openWithPdfJs(
    new Uint8Array(Buffer.from(PASSWORD_PDF_BASE64, "base64")),
  );

  assert.ok(error, "PDF.js opened a password-protected PDF");
  assert.equal(describePdfPreviewFailure(error), LOCKED_PDF_MESSAGE);
});

test("a file that is not a PDF still gets the render-failure message", async () => {
  const error = await openWithPdfJs(new TextEncoder().encode("not a PDF\n"));

  assert.ok(error);
  assert.equal(describePdfPreviewFailure(error), PREVIEW_UNAVAILABLE_MESSAGE);
});

test("an ordinary PDF opens, and other failures are not called locked", async () => {
  const document = await PDFDocument.create();

  document.addPage([612, 792]);

  assert.equal(await openWithPdfJs(await document.save()), null);
  assert.equal(
    describePdfPreviewFailure(new Error("canvas failed")),
    PREVIEW_UNAVAILABLE_MESSAGE,
  );
  assert.equal(describePdfPreviewFailure(null), PREVIEW_UNAVAILABLE_MESSAGE);
});
