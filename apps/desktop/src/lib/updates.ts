/**
 * The optional update check.
 *
 * This is the ONLY feature in the app that touches the network, and it is off
 * until the user turns it on in Settings. When on, the Rust side makes one GET
 * to GitHub's public "latest release" endpoint (see src-tauri/src/updates.rs).
 * Nothing about the user, their files or this install is sent: the request
 * carries no version, no ID and no cookies, and the comparison with the
 * installed version happens here, on this machine.
 *
 * The app never downloads or installs anything itself. An available update is
 * announced with a link to the release page; the user decides what to do.
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
