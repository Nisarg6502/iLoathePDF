/**
 * The optional update check.
 *
 * This is the ONLY feature in the app that touches the network, and it is off
 * until the user turns it on in Settings. When on, the Rust side makes one GET
 * for the latest release's `latest.json` on GitHub (see src-tauri/src/updates.rs).
 * Nothing about the user, their files or this install is sent: the request
 * carries no version, no ID and no cookies, and the comparison with the
 * installed version happens on this machine.
 *
 * Finding an update downloads nothing. The user then chooses "Update now" (or
 * opts in to background downloads): the installer is fetched from the release,
 * checked against the signing key compiled into the app, and only run when the
 * user presses "Restart & update". All of that lives in src-tauri/src/updates.rs.
 *
 * Kept free of React and Tauri imports so scripts/check-updates.ts can load
 * `isNewerVersion` under plain Node.
 */

/** "0.3.0" / "v0.3.0" -> [0, 3, 0], or null when it is not a plain x.y.z. */
function parseVersion(raw: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True when `latest` is a strictly newer release than `installed`. Anything
 * that is not a plain x.y.z (a pre-release tag, garbage) is never "newer", so a
 * odd response can only ever fail to show a banner, never show a wrong one.
 */
export function isNewerVersion(latest: string, installed: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
