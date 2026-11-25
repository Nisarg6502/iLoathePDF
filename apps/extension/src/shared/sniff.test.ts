import { describe, it, expect } from "vitest";
import { sniffImageType } from "./sniff";
import { makeTestPng } from "@/engines/testHelpers";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? Array.from(v, (c) => c.charCodeAt(0)) : [v])));

describe("sniffImageType", () => {
  it("recognises common image signatures", () => {
    expect(sniffImageType(makeTestPng())).toBe("image/png");
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(bytes("BM", 0, 0))).toBe("image/bmp");
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, "ftypavif"))).toBe("image/avif");
    expect(sniffImageType(bytes('<?xml version="1.0"?><svg xmlns="x">'))).toBe("image/svg+xml");
  });

  it("returns null for anything else", () => {
    expect(sniffImageType(bytes("<!doctype html><html>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
