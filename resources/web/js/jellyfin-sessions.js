// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";

/* Active Jellyfin users, sourced by the TinyPPI backend from the existing
   Jellyfin for Kodi connection.  The access token never enters this page. */
(function () {
  const board = document.getElementById("jellyfinBoard");
  const rail = document.getElementById("jellyfinRail");
  const count = document.getElementById("jellyfinCount");
  if (!board || !rail || !window.TinyPPI) return;

  const cards = new Map();
  let timer = 0;

  function value(value, suffix) {
    return value === undefined || value === null || value === ""
      ? "N/A" : String(value) + (suffix || "");
  }

  function art(item, kind) {
    if (!item) return "";
    return TinyPPI.withToken("/api/jellyfin/art?item=" +
      encodeURIComponent(item) + "&kind=" + kind);
  }

  function addText(parent, className, text) {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function makeCard(key) {
    const card = document.createElement("article");
    card.className = "jf-session card";
    card.dataset.key = key;

    const hero = document.createElement("div");
    hero.className = "jf-hero";
    const backdrop = document.createElement("div");
    backdrop.className = "jf-backdrop";
    const poster = document.createElement("img");
    poster.className = "jf-poster";
    poster.alt = "";
    const body = document.createElement("div");
    body.className = "jf-body";

    const identity = document.createElement("div");
    identity.className = "jf-identity";
    const user = addText(identity, "jf-user", "");
    const device = addText(identity, "jf-device", "");
    const state = addText(identity, "jf-state badge", "");

    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    subtitle.className = "jf-subtitle";
    const badges = document.createElement("div");
    badges.className = "jf-badges";

    const progress = document.createElement("div");
    progress.className = "jf-progress";
    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("i");
    track.append(fill);
    const times = document.createElement("div");
    times.className = "jf-times mono";
    const elapsed = addText(times, "", "");
    const remaining = addText(times, "", "");
    const duration = addText(times, "", "");
    progress.append(track, times);

    body.append(identity, title, subtitle, badges, progress);
    hero.append(backdrop, poster, body);
    const groups = document.createElement("div");
    groups.className = "jf-groups";
    card.append(hero, groups);

    const entry = {
      card, backdrop, poster, user, device, state, title, subtitle, badges,
      fill, elapsed, remaining, duration, groups, structure: "", art: ""
    };
    cards.set(key, entry);
    return entry;
  }

  function badgeRow(entry, session) {
    const video = session.video || {};
    const audio = session.audio || {};
    const labels = [
      session.method,
      video.width && video.height ? video.width + "×" + video.height : "",
      video.codec && video.codec.toUpperCase(),
      video.bit_depth ? video.bit_depth + "-bit" : "",
      video.range,
      audio.codec && audio.codec.toUpperCase(),
      audio.channels,
      session.container && session.container.toUpperCase(),
      session.bitrate ? session.bitrate + " Mbps" : ""
    ].filter(Boolean);
    const signature = labels.join("\n");
    if (entry.badges.dataset.signature === signature) return;
    entry.badges.dataset.signature = signature;
    entry.badges.replaceChildren();
    labels.forEach((label, index) => {
      const pill = document.createElement("span");
      pill.className = "badge" + (index === 0 ? " alt" : "");
      pill.textContent = label;
      entry.badges.append(pill);
    });
  }

  function groupData(session) {
    const video = session.video || {};
    const audio = session.audio || {};
    const subtitle = session.subtitle || {};
    return [
      ["Playback", [
        ["User", session.user], ["Client", session.client],
        ["Device", session.device], ["Stream", session.method],
        ["Container", session.container], ["Bitrate", session.bitrate ? session.bitrate + " Mbps" : ""]
      ]],
      ["Video", [
        ["Codec", video.codec], ["Profile", video.profile],
        ["Resolution", video.width && video.height ? video.width + "×" + video.height : ""],
        ["Bit depth", video.bit_depth ? video.bit_depth + " bit" : ""],
        ["Frame rate", video.frame_rate ? video.frame_rate + " fps" : ""],
        ["HDR", video.range], ["Delivery", video.direct ? "Direct" : "Transcoded"]
      ]],
      ["Audio", [
        ["Codec", audio.codec], ["Channels", audio.channels],
        ["Language", audio.language], ["Track", audio.title],
        ["Sample rate", audio.sample_rate ? audio.sample_rate + " Hz" : ""],
        ["Bitrate", audio.bitrate ? Math.round(audio.bitrate / 1000) + " kbps" : ""],
        ["Delivery", audio.direct ? "Direct" : "Transcoded"]
      ]],
      ["Subtitles", [
        ["Track", subtitle.title], ["Codec", subtitle.codec],
        ["Language", subtitle.language],
        ["Source", subtitle.title ? (subtitle.external ? "External" : "Embedded") : "Off"]
      ]],
      ["Transcode reasons", (session.reasons || []).length
        ? session.reasons.map((reason) => ["Reason", reason])
        : [["Status", session.method === "Transcode" ? "Not reported" : "Not transcoding"]]]
    ];
  }

  function renderGroups(entry, session) {
    const data = groupData(session);
    const signature = JSON.stringify(data);
    if (entry.structure === signature) return;
    entry.structure = signature;
    entry.groups.replaceChildren();
    data.forEach(([name, rows]) => {
      const group = document.createElement("section");
      group.className = "jf-group";
      const heading = document.createElement("h3");
      heading.textContent = name;
      const body = document.createElement("div");
      body.className = "jf-rows";
      rows.forEach(([label, content]) => {
        const row = document.createElement("div");
        row.className = "jf-row";
        addText(row, "jf-key", label);
        addText(row, "jf-value mono", value(content));
        body.append(row);
      });
      group.append(heading, body);
      entry.groups.append(group);
    });
  }

  function updateCard(entry, session) {
    entry.user.textContent = session.user || "Unknown user";
    entry.device.textContent = [session.client, session.device].filter(Boolean).join(" — ");
    entry.state.textContent = session.paused ? "Paused" : "Playing";
    entry.state.classList.toggle("paused", !!session.paused);
    entry.title.textContent = session.series || session.title || "—";
    entry.subtitle.textContent = [session.episode, session.series ? session.title : "", session.year]
      .filter(Boolean).join(" · ");
    entry.fill.style.width = value(session.progress, "%");
    entry.elapsed.textContent = session.position || "--:--";
    entry.remaining.textContent = session.remaining ? session.remaining + " remaining" : "";
    entry.duration.textContent = session.duration || "--:--";

    const artKey = [session.image_item, session.backdrop_item].join("|");
    if (entry.art !== artKey) {
      entry.art = artKey;
      entry.poster.src = art(session.image_item, "primary");
      const backdrop = art(session.backdrop_item, "backdrop");
      entry.backdrop.style.backgroundImage = backdrop ? 'url("' + backdrop + '")' : "none";
    }
    badgeRow(entry, session);
    renderGroups(entry, session);
  }

  function render(payload) {
    const sessions = (payload && payload.sessions) || [];
    board.classList.toggle("hidden", !sessions.length);
    count.textContent = sessions.length ? sessions.length + (sessions.length === 1 ? " active" : " active") : "";
    const seen = new Set();
    sessions.forEach((session, index) => {
      const key = session.id || [session.user, session.client, session.device].join("|");
      seen.add(key);
      const entry = cards.get(key) || makeCard(key);
      updateCard(entry, session);
      const at = rail.children[index];
      if (at !== entry.card) rail.insertBefore(entry.card, at || null);
    });
    for (const [key, entry] of cards) {
      if (!seen.has(key)) {
        entry.card.remove();
        cards.delete(key);
      }
    }
  }

  async function refresh() {
    window.clearTimeout(timer);
    try {
      render(await TinyPPI.getJSON("/api/jellyfin"));
    } catch (_) {
      /* Keep the last good frame through a short Jellyfin interruption. */
    }
    timer = window.setTimeout(refresh, document.hidden ? 8000 : 2500);
  }

  document.addEventListener("visibilitychange", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 100);
  });
  refresh();
})();

