import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { isEncrypted } from "@pdfsmaller/pdf-decrypt";
import { protectEngine } from "./protect";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array, name = "doc.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

describe("protectEngine", () => {
  it("protect mode encrypts the PDF with the given password", async () => {
    const file = await toFile(await makeTestPdf(2));

    const result = await protectEngine({
      files: [file],
      options: { mode: "protect", password: "secret1" },
    });

    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    await expect(PDFDocument.load(outBytes)).rejects.toThrow();
    const info = await isEncrypted(outBytes);
    expect(info.encrypted).toBe(true);
    expect(info.algorithm).toBe("AES-256");
  });

  it("unlock mode removes protection given the correct password", async () => {
    const plain = await toFile(await makeTestPdf(3));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    const unlocked = await protectEngine({
      files: [protectedFile],
      options: { mode: "unlock", password: "secret1" },
    });

    const outBytes = new Uint8Array(await unlocked.files[0].blob.arrayBuffer());
    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("unlock mode rejects the wrong password", async () => {
    const plain = await toFile(await makeTestPdf(1));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    await expect(
      protectEngine({ files: [protectedFile], options: { mode: "unlock", password: "wrong" } }),
    ).rejects.toThrow(/password/i);
  });

  it("protect mode rejects an already-encrypted input", async () => {
    const plain = await toFile(await makeTestPdf(1));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    await expect(
      protectEngine({ files: [protectedFile], options: { mode: "protect", password: "secret2" } }),
    ).rejects.toThrow(/already/i);
  });

  it("rejects a password shorter than 4 characters", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      protectEngine({ files: [file], options: { mode: "protect", password: "abc" } }),
    ).rejects.toThrow();
  });

  it("rejects an empty file list", async () => {
    await expect(
      protectEngine({ files: [], options: { mode: "protect", password: "secret1" } }),
    ).rejects.toThrow();
  });
});
