/**
 * The extension manifest, written here so every permission can carry the
 * reason it is asked for. The build writes it to dist/manifest.json (Chrome,
 * Edge) and scripts/zip.ts derives the Firefox variant from it.
 *
 * Privacy: nothing here lets the extension send anything anywhere. There is
 * no remote code, the pages' CSP only allows the extension's own scripts, and
 * no permission grants access to a site until the user asks for it.
 */
export function chromeManifest(version: string) {
  return {
    manifest_version: 3,
    name: "__MSG_extName__",
    short_name: "iLoathePDF",
    description: "__MSG_extDescription__",
    version,
    default_locale: "en",
    icons: { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },

    action: {
      default_popup: "popup.html",
      default_title: "__MSG_extName__",
      default_icon: { "16": "icons/icon-16.png", "32": "icons/icon-32.png" },
    },

    background: { service_worker: "background.js" },

    permissions: [
      // Temporary access to the tab the user is looking at, and only after they
      // click the toolbar button or one of our right-click items. Used to show
      // the "Fit" buttons on that page and to read the bytes of an image they
      // right-clicked. Shows no install-time warning.
      "activeTab",
      // Puts the content script into that tab (executeScript), and into the
      // sites the user chose "Always show on this site" for
      // (registerContentScripts).
      "scripting",
      // The right-click items "Add image to PDF" and "Fit a file to this form".
      "contextMenus",
    ],

    // Nothing is granted at install. The popup asks for one site
    // ("https://example.com/*") when the user ticks "Always show on this site",
    // or for all sites when they tick that option. Without it the buttons only
    // appear after a click on the toolbar button (activeTab). We chose this
    // over a content script on <all_urls>: the always-on version would be
    // smoother, but it would put a script in every page the user visits and
    // show "Read and change all your data on all websites" at install, which
    // is the opposite of what a privacy tool should ask for by default.
    optional_host_permissions: ["<all_urls>"],

    // The fitter opens as an iframe over the page, so the page must be allowed
    // to frame it. use_dynamic_url changes its URL every browser session, so a
    // site can't guess the address and load it on its own.
    web_accessible_resources: [{ resources: ["fit.html"], matches: ["<all_urls>"], use_dynamic_url: true }],

    // The MV3 default, written out: only the extension's own scripts, and
    // WebAssembly compilation (pdf.js may use it for some image formats).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },

    minimum_chrome_version: "116",
  };
}

/**
 * Firefox runs MV3 background code as an event page, not a service worker,
 * and needs an add-on id. Everything else is shared.
 */
export function firefoxManifest(version: string) {
  const base = chromeManifest(version);
  const { minimum_chrome_version: _chromeOnly, web_accessible_resources, ...rest } = base;
  void _chromeOnly;
  return {
    ...rest,
    background: { scripts: ["background.js"] },
    // Firefox doesn't know use_dynamic_url; leave it out rather than warn.
    web_accessible_resources: web_accessible_resources.map(({ use_dynamic_url: _dyn, ...r }) => (void _dyn, r)),
    browser_specific_settings: { gecko: { id: "extension@iloathepdf.com", strict_min_version: "128.0" } },
  };
}
