// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 U3knOwn

"use strict";

/* The question a press on a film, show or episode asks: play, play from
   the start, or mark as watched or unwatched.

   Part of the dashboard page: a classic script sharing the global scope
   of js/dashboard.js and its other parts (see index.html for the order).
   What it uses from them and what it gives them is listed below. */

/* global continueStale, control, el, filmsStale, refreshEpisodes,
   requestContinue, requestFilms, requestSeries, seriesStale, T */
/* exported ask */

/* --- what a press asks ---------------------------------------------------- */

/* A press on a film, a series or an episode asks what is wanted of it: to
   play it (or, for a series, to open it -- a series is not a thing that can
   be played), or to have the box count it as seen or as unseen.  The last two
   are written into Kodi's own library (see ``set_watched`` in
   web/library.py); a series marked either way is every episode of it.

   Written and then read back rather than drawn here: the box drops what it
   holds the moment it has written, and the walls, the row and the open show
   are read again, so what they show is what the library now says. */

let overviewTimer = null;
let asking = null;         /* what the open question is about              */

function ask(question) {
  if (!control || el.markDialog.open) return;
  asking = question;
  el.markTitle.textContent = question.title;
  el.markPlay.textContent = question.play;
  /* From the beginning, and forgetting where it got to, are answers only for
     a title that has got somewhere. */
  el.markRestart.hidden = !question.resumable;
  el.markClear.hidden = !question.resumable;
  el.markDialog.returnValue = "";
  el.markDialog.showModal();
  let panel = document.getElementById("libraryOverview");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "libraryOverview";
    panel.setAttribute("aria-label", T.plot);
    el.markTitle.after(panel);
  }
  const previousArt = document.getElementById("libraryArtwork");
  if (previousArt) previousArt.remove();
  const art = document.createElement("img");
  art.id = "libraryArtwork";
  art.alt = "";
  art.hidden = true;
  art.style.cssText = "display:block;width:100%;max-height:260px;object-fit:cover;aspect-ratio:16/9;border-radius:12px";
  panel.before(art);
  const query = new URLSearchParams(question.body).toString();
  const episode = Boolean(question.body.episodeid);
  let poster = false;
  art.addEventListener("load", () => {
    if (asking === question) {
      art.hidden = false;
      art.style.display = "block";
    }
  });
  art.addEventListener("error", () => {
    if (asking !== question) return;
    if (!poster) {
      poster = true;
      art.style.objectFit = "contain";
      TinyPPI.loadArtwork(art, "/api/art?kind=poster&" + query);
    } else {
      art.hidden = true;
      art.style.display = "none";
    }
  });
  art.style.display = "none";
  TinyPPI.loadArtwork(art, "/api/art?kind=" + (episode ? "thumb" : "fanart") + "&" + query);
  panel.replaceChildren();
  delete panel.dataset.signature;
  panel.hidden = true;
  loadOverview(question, panel);

}

el.markDialog.addEventListener("close", () => {
  clearTimeout(overviewTimer);
  const answer = el.markDialog.returnValue;
  const question = asking;
  asking = null;
  if (!question) return;
  if (answer === "play") question.onPlay(false);
  else if (answer === "restart") question.onPlay(true);
  else if (answer === "clear") clearResume(question.body);
  else if (answer === "watched" || answer === "unwatched") {
    setWatched(question.body, answer === "watched");
  }
});

/* Read the selected title, never the playing one. Late replies may not
   replace a newer selection, and unavailable details leave controls usable. */
async function loadOverview(question, panel, refresh = 0) {
  try {
    const query = new URLSearchParams(question.body).toString();
    const media = await TinyPPI.getJSON("/api/overview?" + query);
    if (asking !== question || !el.markDialog.open) return;
    TinyPPI.panels.overview(panel, media);
    // Existing rating providers fill their caches in the background.
    if (refresh < 2) overviewTimer = setTimeout(() => loadOverview(question, panel, refresh + 1), 2500);
  } catch (_) { /* Details must not prevent playing or marking a title. */ }
}

/* Forget where a film or an episode got to, leaving it seen or unseen as it
   was: it leaves the row of things half-watched, and its bar leaves the wall. */
async function clearResume(body) {
  if (await post("/api/resume", body)) reread();
}

/* One of the library writes, answering whether the box took it and saying so
   where it did not. */
async function post(route, body) {
  if (TinyPPI.relayOrigin) return false;
  try {
    const response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TinyPPI-Token": TinyPPI.token },
      body: JSON.stringify(body)
    });
    if (response.status === 401) {
      TinyPPI.toast(T.token_bad, true);
      TinyPPI.askToken();
      return false;
    }
    if (!response.ok) {
      TinyPPI.toast(T.mark_failed, true);
      return false;
    }
    return true;
  } catch (_) {
    TinyPPI.toast(T.mark_failed, true);
    return false;
  }
}

async function setWatched(body, watched) {
  if (await post("/api/watched", Object.assign({ watched }, body))) reread();
}

/* Read everything the write may have moved, at once rather than on the next
   version the snapshot carries: the box has already dropped what it held, and
   the answer somebody just asked for should not wait on the producer's
   cadence to appear. */
function reread() {
  filmsStale();
  seriesStale();
  continueStale();
  requestFilms(true);
  requestSeries(true);
  requestContinue(true);
  refreshEpisodes();
}
