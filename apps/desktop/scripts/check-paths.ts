/**
 * Guard for the path and file-name helpers in src/lib/utils.ts.
 *
 * baseName/dirName once split only on "/", so every Windows path (the only
 * kind the file picker returns) came back whole with an empty folder. The next
 * step, "where do I save the result?", then failed with FILE_NOT_FOUND, which
 * the UI words as "that file was moved or deleted" -- and Images to PDF looked
 * broken for everyone not saving to a custom folder.
 *
 * apps/desktop/src has no frontend test runner, so like check-recipe-steps.ts
 * this is a standalone script run with Node's built-in TypeScript support:
 *
 *   npm run check:paths
 */
import { baseName, dirName, isAbsolutePath, joinPath, safeFileStem, stripExt } from "../src/lib/utils.ts";

const BS = String.fromCharCode(92);
const win = (...parts: string[]) => parts.join(BS);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) return;
  failures += 1;
  console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

const photo = win("C:", "Users", "Me", "Pictures", "Self pic.jpg");
check("baseName of a Windows path", baseName(photo), "Self pic.jpg");
check("dirName of a Windows path", dirName(photo), win("C:", "Users", "Me", "Pictures"));
check("dirName of a file in a drive root keeps the separator", dirName(win("G:", "a.jpg")), win("G:", ""));
check("a drive-root parent is still absolute", isAbsolutePath(dirName(win("G:", "a.jpg"))), true);
check("baseName of a UNC path", baseName(win("", "", "server", "share", "x.png")), "x.png");
check("baseName of a POSIX-style path", baseName("/home/me/x.png"), "x.png");
check("baseName of a bare name", baseName("x.png"), "x.png");
check("stripExt", stripExt("Self pic.jpg"), "Self pic");

check("absolute: drive path", isAbsolutePath(win("C:", "Users", "Me")), true);
check("absolute: drive root", isAbsolutePath(win("G:", "")), true);
check("absolute: drive path with forward slashes", isAbsolutePath("C:/Users/Me"), true);
check("absolute: UNC path", isAbsolutePath(win("", "", "server", "share")), true);
check("absolute: bare file name", isAbsolutePath("x.png"), false);
check("absolute: relative path", isAbsolutePath(win("Users", "Me")), false);
check("absolute: empty", isAbsolutePath(""), false);

// macOS paths: the file picker and Finder hand over "/Users/..." paths.
check("baseName of a macOS path", baseName("/Users/me/Pictures/Self pic.jpg"), "Self pic.jpg");
check("dirName of a macOS path", dirName("/Users/me/Pictures/Self pic.jpg"), "/Users/me/Pictures");
check("dirName of a file at the top of the disk", dirName("/a.jpg"), "/");
check("absolute: macOS path", isAbsolutePath("/Users/me"), true);
check("absolute: macOS parent of a top-level file", isAbsolutePath(dirName("/a.jpg")), true);
check("joinPath on macOS", joinPath("/Users/me", "x.pdf"), "/Users/me/x.pdf");
check("joinPath on the macOS root", joinPath("/", "x.pdf"), "/x.pdf");
check("joinPath on Windows", joinPath(win("C:", "Users"), "x.pdf"), win("C:", "Users", "x.pdf"));
check("joinPath on a Windows drive root", joinPath(win("G:", ""), "x.pdf"), win("G:", "x.pdf"));

check("safeFileStem keeps a normal name", safeFileStem("Trip photos", "images"), "Trip photos");
check("safeFileStem blank -> fallback", safeFileStem("   ", "images"), "images");
check("safeFileStem undefined -> fallback", safeFileStem(undefined, "images"), "images");
check("safeFileStem strips typed .pdf", safeFileStem("scan.PDF", "images"), "scan");
check("safeFileStem strips separators", safeFileStem(win("a", "b") + "/c:d", "images"), "abcd");
check("safeFileStem trailing dots", safeFileStem("name. .", "images"), "name");
check("safeFileStem reserved name", safeFileStem("NUL", "images"), "images");
check("safeFileStem reserved name with suffix", safeFileStem("con.backup", "images"), "images");

if (failures > 0) {
  console.error(`\n${failures} path check(s) failed.`);
  process.exit(1);
}
console.log("path helpers OK");
