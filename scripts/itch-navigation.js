(() => {
  "use strict";

  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement) || !script.src) return;

  const projectRoot = new URL(".", script.src);
  const routeFiles = new Map([
    ["/holdem", "holdem.html"],
    ["/holdem/feedback", "holdem/feedback.html"],
    ["/holdem/guide", "holdem/guide.html"],
    ["/holdem/practice", "holdem/practice.html"],
    ["/holdem/settings", "holdem/settings.html"],
    ["/holdem/single", "holdem/single.html"],
  ]);

  function staticUrl(rawHref) {
    if (typeof rawHref !== "string" || !rawHref.startsWith("/holdem")) {
      return null;
    }

    const requested = new URL(rawHref, window.location.origin);
    const file = routeFiles.get(requested.pathname);
    if (file == null) return null;

    const target = new URL(file, projectRoot);
    target.search = requested.search;
    target.hash = requested.hash;
    return target.href;
  }

  function patchAnchor(anchor) {
    const rawHref = anchor.dataset.itchRoute ?? anchor.getAttribute("href");
    const mapped = staticUrl(rawHref);
    if (mapped == null) return;
    anchor.dataset.itchRoute = rawHref;
    if (anchor.href !== mapped) anchor.href = mapped;
  }

  function patchAnchors(root) {
    if (root instanceof HTMLAnchorElement) patchAnchor(root);
    if (!(root instanceof Element) && root !== document) return;
    root.querySelectorAll("a[href]").forEach(patchAnchor);
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const mapped = staticUrl(anchor.dataset.itchRoute);
      if (mapped == null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(mapped);
    },
    true,
  );

  document.addEventListener("DOMContentLoaded", () => patchAnchors(document));
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) patchAnchors(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
