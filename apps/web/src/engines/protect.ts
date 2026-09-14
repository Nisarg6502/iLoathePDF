import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import { decryptPDF, isEncrypted } from "@pdfsmaller/pdf-decrypt";
import type { Engine } from "./types";

const MIN_PASSWORD_LENGTH = 4;

export const protectEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to protect or unlock.");

  const mode = (options.mode as string) ?? "protect";
  const password = (options.password as string) ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (mode === "protect") {
    const info = await isEncrypted(bytes);
    if (info.encrypted) {
      throw new Error("This PDF already has a password — unlock it first.");
    }
    const encrypted = await encryptPDF(bytes, password);
    return {
      files: [
        {
          name: file.name.replace(/\.pdf$/i, "-protected.pdf"),
          blob: new Blob([encrypted as BlobPart], { type: "application/pdf" }),
        },
      ],
      summary: "Password protection added.",
      isPreview: false,
    };
  }

  if (mode === "unlock") {
    let decrypted: Uint8Array;
    try {
      decrypted = await decryptPDF(bytes, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      if (lower.includes("not encrypted")) {
        throw new Error("This PDF isn't password protected.");
      }
      if (lower.includes("unsupported encryption")) {
        throw new Error("This PDF uses an encryption type the browser version can't open — try the desktop app.");
      }
      throw new Error("Incorrect password.");
    }
    return {
      files: [
        {
          name: file.name.replace(/\.pdf$/i, "-unlocked.pdf"),
          blob: new Blob([decrypted as BlobPart], { type: "application/pdf" }),
        },
      ],
      summary: "Password protection removed.",
      isPreview: false,
    };
  }

  throw new Error(`Unknown mode: ${mode}`);
};
