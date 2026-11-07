/**
 * Guard for the version comparison behind the optional update check.
 *
 * The check must never announce an "update" that is not one: a banner for an
 * older or malformed version would be noise at best and a trust problem at
 * worst for an app whose pitch is that it stays quiet. Anything that is not a
 * plain x.y.z therefore counts as "not newer".
 *
 *   npm run check:updates
 */
import { isNewerVersion } from "../src/lib/updates.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) return;
  failures += 1;
  console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

check("patch bump is newer", isNewerVersion("0.2.1", "0.2.0"), true);
check("minor bump is newer", isNewerVersion("0.3.0", "0.2.9"), true);
check("major bump is newer", isNewerVersion("1.0.0", "0.9.9"), true);
check("numeric, not lexical (0.10.0 > 0.9.0)", isNewerVersion("0.10.0", "0.9.0"), true);
check("same version is not newer", isNewerVersion("0.2.0", "0.2.0"), false);
check("older is not newer", isNewerVersion("0.1.9", "0.2.0"), false);
check("leading v is accepted", isNewerVersion("v0.3.0", "0.2.0"), true);
check("pre-release is never newer", isNewerVersion("0.3.0-beta.1", "0.2.0"), false);
check("garbage is never newer", isNewerVersion("latest", "0.2.0"), false);
check("empty is never newer", isNewerVersion("", "0.2.0"), false);
check("garbage installed version is never 'older'", isNewerVersion("0.3.0", "dev"), false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("check-updates: all passed");
