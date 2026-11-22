// See 404.html: send a deep link that is not a prerendered page to index.html,
// carrying the path in the query string for spa-restore.js to put back.
var pathSegmentsToKeep = 0; // served from the root of iloathepdf.com, no base path to keep
var l = window.location;
l.replace(
  l.protocol +
    "//" +
    l.hostname +
    (l.port ? ":" + l.port : "") +
    l.pathname
      .split("/")
      .slice(0, 1 + pathSegmentsToKeep)
      .join("/") +
    "/?/" +
    l.pathname.slice(1).split("/").slice(pathSegmentsToKeep).join("/").replace(/&/g, "~and~") +
    (l.search ? "&" + l.search.slice(1).replace(/&/g, "~and~") : "") +
    l.hash,
);
