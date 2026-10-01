/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Keep artwork local to each box, and never show the previous title's art
   while a new image loads. Failed/missing art leaves the existing tint alone. */
(function () {
  "use strict";
  let current = "", generation = 0;
  function show(card, tag) {
    tag = tag || "";
    if (tag === current) return;
    current = tag;
    const request = ++generation;
    card.style.removeProperty("--hero-fanart");
    card.classList.remove("has-fanart");
    if (!tag) return;
    const url = TinyPPI.withToken("/api/art?kind=fanart&v=" + encodeURIComponent(tag));
    const picture = new Image();
    picture.onload = () => {
      if (request !== generation || !picture.naturalWidth) return;
      card.style.setProperty("--hero-fanart", "url(" + JSON.stringify(url) + ")");
      card.classList.add("has-fanart");
    };
    picture.src = url;
  }
  window.TinyPPIHeroFanart = { show };
})();
