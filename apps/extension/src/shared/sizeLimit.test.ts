import { describe, it, expect } from "vitest";
import { parseFormats, parseSizeAttribute, parseSizeLimit } from "./sizeLimit";

const KB = 1000;
const KiB = 1024;
const MB = 1_000_000;
const MiB = 1_048_576;

describe("parseSizeLimit: maximums", () => {
  it.each([
    ["Max 200 KB", 200 * KB],
    ["Max. size: 2MB", 2 * MB],
    ["(Max 2MB)", 2 * MB],
    ["Maximum file size 5 MB", 5 * MB],
    ["Maximum size allowed is 1MB.", 1 * MB],
    ["max file size is 10mb", 10 * MB],
    ["less than 2MB", 2 * MB],
    ["Size should be less than 100 kb", 100 * KB],
    ["Size of photo should be less than 100 kb", 100 * KB],
    ["File Size Should not more than 2MB", 2 * MB],
    ["Not more than 300 KB", 300 * KB],
    ["File size must not exceed 1.5 MB", 1.5 * MB],
    ["Files exceeding 2MB will be rejected", 2 * MB],
    ["Upto 2 MB", 2 * MB],
    ["up to 500kb", 500 * KB],
    ["under 1 MB", 1 * MB],
    ["below 500KB", 500 * KB],
    ["Size should be less than or equal to 300 KB", 300 * KB],
    ["not greater than 1 MB", 1 * MB],
    ["Size limit: 2MB", 2 * MB],
    ["File must be within 200kb", 200 * KB],
    ["at most 750 KB", 750 * KB],
    ["<= 200 KB", 200 * KB],
    ["< 2MB", 2 * MB],
    ["2MB max", 2 * MB],
    ["50 KB (maximum)", 50 * KB],
    ["1 MB or less", 1 * MB],
    ["Upload photo (100 KB)", 100 * KB],
    ["Max size 200kb only", 200 * KB],
    ["Max 200K", 200 * KB],
    ["Max 2M", 2 * MB],
    ["Maximum 1,5 MB", 1.5 * MB],
    ["Maximum 1,024 KB", 1024 * KB],
    ["Max 100 kilobytes", 100 * KB],
    ["Max 3 megabytes", 3 * MB],
    ["Max 512 KiB", 512 * KiB],
    ["Max 2 MiB", 2 * MiB],
    ["Files larger than 2 MB will be rejected", 2 * MB],
    ["Images above 1MB are not accepted", 1 * MB],
    ["Upload your CV. 2MB max", 2 * MB],
    ["Max 200 KB", 200 * KB],
  ])("%s", (text, max) => {
    const result = parseSizeLimit(text);
    expect(result.maxBytes).toBe(max);
    expect(result.minBytes).toBeUndefined();
  });

  it("keeps the evidence it read the limit from", () => {
    expect(parseSizeLimit("Photo. Size should be less than 100 kb").evidence).toBe("Size should be less than 100 kb");
    expect(parseSizeLimit("Upload your CV. 2MB max").evidence).toBe("2MB max");
  });
});

describe("parseSizeLimit: minimums and ranges", () => {
  it.each([
    ["between 20KB and 50KB", 20 * KiB, 50 * KB],
    ["Size should be between 10 KB and 1 MB", 10 * KiB, 1 * MB],
    ["Photo: 20 KB to 50 KB", 20 * KiB, 50 * KB],
    ["Photo Size should be 20 kb to 50 kb", 20 * KiB, 50 * KB],
    ["Image size must be between 4 KB to 30 KB", 4 * KiB, 30 * KB],
    ["Size: 10-200 KB", 10 * KiB, 200 * KB],
    ["Upload Signature (Size: 10kb - 20kb, Format: JPG)", 10 * KiB, 20 * KB],
    ["20KB – 50KB", 20 * KiB, 50 * KB],
    ["from 10 kb to 200 kb", 10 * KiB, 200 * KB],
    ["min 10KB max 50KB", 10 * KiB, 50 * KB],
    ["Minimum 20 KB and maximum 200 KB", 20 * KiB, 200 * KB],
    ["Image size must be greater than 10 KB and less than 200 KB", 10 * KiB, 200 * KB],
    ["File must be at least 10KB and at most 200KB", 10 * KiB, 200 * KB],
    [">= 10KB and <= 100KB", 10 * KiB, 100 * KB],
    ["Upload a JPG (max 200kb, min 20kb)", 20 * KiB, 200 * KB],
    ["Photo should not be less than 20 KB and not more than 50 KB", 20 * KiB, 50 * KB],
  ])("%s", (text, min, max) => {
    const result = parseSizeLimit(text);
    expect(result.minBytes).toBe(min);
    expect(result.maxBytes).toBe(max);
  });

  it("reads a minimum on its own", () => {
    const atLeast = parseSizeLimit("Photo should be at least 20kb");
    expect(atLeast.minBytes).toBe(20 * KiB);
    expect(atLeast.maxBytes).toBeUndefined();
    expect(parseSizeLimit("Files smaller than 10 KB are not accepted")).toMatchObject({ minBytes: 10 * KiB });
    expect(parseSizeLimit("10 KB or more")).toMatchObject({ minBytes: 10 * KiB });
  });

  it("keeps a minimum in a different clause from a pixel requirement out of the size", () => {
    expect(parseSizeLimit("Minimum 600 x 600 pixels, 2MB")).toEqual({ maxBytes: 2 * MB, evidence: "2MB" });
  });

  it("uses the smallest of several maximums", () => {
    expect(parseSizeLimit("Max 2 MB per file. Total under 500 KB").maxBytes).toBe(500 * KB);
  });

  it("drops a minimum that is not below the maximum", () => {
    const result = parseSizeLimit("at least 5 MB, at most 1 MB");
    expect(result.maxBytes).toBe(1 * MB);
    expect(result.minBytes).toBeUndefined();
  });
});

describe("parseSizeLimit: things that are not size limits", () => {
  it.each([
    "",
    "Upload your photo",
    "Max 5 files",
    "Takes about 10 minutes",
    "Speed 5 kbps",
    "A 12 Megapixel camera",
    "Use A4 paper, 2 copies",
    "200 x 230 pixels",
    "Version 1.2.3",
  ])("%s", (text) => {
    const result = parseSizeLimit(text);
    expect(result.maxBytes).toBeUndefined();
    expect(result.minBytes).toBeUndefined();
  });

  it("needs a single-letter unit to touch its number", () => {
    expect(parseSizeLimit("Max 5 m").maxBytes).toBeUndefined();
    expect(parseSizeLimit("Max 5m").maxBytes).toBe(5 * MB);
  });
});

describe("parseSizeAttribute", () => {
  it("reads bytes, or KB/MB when the attribute name says so, or a value with a unit", () => {
    expect(parseSizeAttribute("data-max-size", "204800", "max")).toBe(204800);
    expect(parseSizeAttribute("data-max-size-kb", "200", "max")).toBe(200 * KB);
    expect(parseSizeAttribute("data-maxsize-mb", "2", "max")).toBe(2 * MB);
    expect(parseSizeAttribute("data-max-size", "2MB", "max")).toBe(2 * MB);
    expect(parseSizeAttribute("data-min-size", "20 KB", "min")).toBe(20 * KiB);
    expect(parseSizeAttribute("data-max-size", "", "max")).toBeUndefined();
    expect(parseSizeAttribute("data-max-size", "large", "max")).toBeUndefined();
  });
});

describe("parseFormats", () => {
  it.each([
    ["JPG/JPEG only", ["jpeg"]],
    ["Only PDF files are allowed", ["pdf"]],
    ["Format: JPG, PNG", ["jpeg", "png"]],
    ["Allowed: .jpg, .png, .webp", ["jpeg", "png", "webp"]],
    ["Upload in .pdf format (Max size: 1MB)", ["pdf"]],
    ["Photo (jpeg) and scanned copy (pdf)", ["jpeg", "pdf"]],
    ["Upload your photo", []],
    ["Upload a graphic", []],
  ])("%s", (text, formats) => {
    expect(parseFormats(text)).toEqual(formats);
  });
});
