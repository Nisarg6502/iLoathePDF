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
import { baseName, dirName, isAbsoluteWindowsPath, safeFileStem, stripExt } from "../src/lib/utils.ts";

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
check("a drive-root parent is still absolute", isAbsoluteWindowsPath(dirName(win("G:", "a.jpg"))), true);
check("baseName of a UNC path", baseName(win("", "", "server", "share", "x.png")), "x.png");
check("baseName of a POSIX-style path", baseName("/home/me/x.png"), "x.png");
check("baseName of a bare name", baseName("x.png"), "x.png");
check("stripExt", stripExt("Self pic.jpg"), "Self pic");

check("absolute: drive path", isAbsoluteWindowsPath(win("C:", "Users", "Me")), true);
check("absolute: drive root", isAbsoluteWindowsPath(win("G:", "")), true);
check("absolute: drive path with forward slashes", isAbsoluteWindowsPath("C:/Users/Me"), true);
check("absolute: UNC path", isAbsoluteWindowsPath(win("", "", "server", "share")), true);
check("absolute: bare file name", isAbsoluteWindowsPath("x.png"), false);
check("absolute: relative path", isAbsoluteWindowsPath(win("Users", "Me")), false);
check("absolute: empty", isAbsoluteWindowsPath(""), false);

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
