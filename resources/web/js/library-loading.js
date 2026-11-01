// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 U3knOwn

"use strict";

/* Lightweight poster placeholders shared by the film, series and continue
   shelves.  The real tiles replace these nodes as soon as the API answers. */
window.TinyPPILibraryLoading = (function () {
  function tile() {
    const item = document.createElement("div");
    item.className = "library-skeleton";
    item.setAttribute("aria-hidden", "true");
    const poster = document.createElement("span");
    poster.className = "library-skeleton-poster";
    const title = document.createElement("span");
    title.className = "library-skeleton-line title";
    const meta = document.createElement("span");
    meta.className = "library-skeleton-line meta";
    item.append(poster, title, meta);
    return item;
  }

  function show(container, count) {
    if (!container || [...container.children].some((child) =>
      !child.classList.contains("library-skeleton"))) return;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) fragment.append(tile());
    container.replaceChildren(fragment);
    container.classList.add("library-loading");
    container.setAttribute("aria-busy", "true");
  }

  function clear(container) {
    if (!container) return;
    for (const item of container.querySelectorAll(":scope > .library-skeleton")) item.remove();
    container.classList.remove("library-loading");
    container.removeAttribute("aria-busy");
  }

  function showCard(card, container, count) {
    if (!card || !container) return;
    card.classList.remove("hidden");
    show(container, count);
  }

  return { show, clear, showCard };
})();
