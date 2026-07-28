(() => {
  "use strict";

  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement) || !script.src) return;

  const projectRoot = new URL(".", script.src);
  const routeFiles = new Map([
    ["/holdem", "holdem.html"],
    ["/holdem/feedback", "holdem/feedback.html"],
    ["/holdem/fx-preview", "holdem/fx-preview.html"],
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

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const mapped = staticUrl(anchor.getAttribute("href"));
      if (mapped == null) return;

      // Let the browser perform the anchor's native navigation after the click
      // finishes. Calling location.assign() while itch.io is still dispatching
      // the iframe click can show Chrome's transient "page couldn't load"
      // screen; rewriting only the clicked link avoids that failed first load.
      anchor.href = mapped;
      event.stopImmediatePropagation();
    },
    true,
  );
})();
