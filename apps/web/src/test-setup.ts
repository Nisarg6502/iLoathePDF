import "@testing-library/jest-dom/vitest";

// jsdom does not implement URL.createObjectURL/revokeObjectURL; ResultCard uses
// createObjectURL to build download links, so stub it for tests.
if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = () => "blob:mock-url";
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = () => {};
}
