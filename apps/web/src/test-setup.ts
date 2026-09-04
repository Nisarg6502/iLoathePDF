import "@testing-library/jest-dom/vitest";

// jsdom does not implement URL.createObjectURL/revokeObjectURL; ResultCard uses
// createObjectURL to build download links, so stub it for tests.
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock-url";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}

// jsdom's Blob/File implementation does not implement arrayBuffer() (used
// by engines to read uploaded files and by tests to read engine output).
// Polyfill it via FileReader, which jsdom does implement fully.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
