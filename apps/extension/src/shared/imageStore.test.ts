import { describe, it, expect } from "vitest";
import { imageNameFromUrl, reorder } from "./imageStore";

describe("reorder", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("moves an item up or down and stops at the ends", () => {
    expect(reorder(list, "b", -1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(reorder(list, "b", 1).map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(reorder(list, "a", -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(reorder(list, "c", 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(reorder(list, "zz", 1)).toEqual(list);
  });
});

describe("imageNameFromUrl", () => {
  it("uses the URL's file name, adding an extension from the type when missing", () => {
    expect(imageNameFromUrl("https://cdn.example.com/a/cat.png?w=200", "image/png", 1)).toBe("cat.png");
    expect(imageNameFromUrl("https://example.com/photos/12345", "image/jpeg", 1)).toBe("12345.jpg");
    expect(imageNameFromUrl("https://example.com/my%20photo.webp", "image/webp", 1)).toBe("my photo.webp");
    expect(imageNameFromUrl("data:image/png;base64,AAAA", "image/png", 3)).toBe("image-3.png");
    expect(imageNameFromUrl("https://example.com/", "image/gif", 2)).toBe("image-2.gif");
  });
});
