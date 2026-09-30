// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/* Label the ORIGINAL TinyPPI card with this Kodi installation's Jellyfin
   account. Preserve its artwork, controls and all local measurements. */
(function () {
  const host = document.querySelector("#nowCard .now");
  if (!host || !window.TinyPPI) return;
  const label = document.createElement("div");
  label.className = "jellyfin-user hidden";
  label.setAttribute("aria-live", "polite");
  host.prepend(label);
  const status = document.getElementById("jellyfinLinkStatus");
  const messages = {
    jellyfin_for_kodi_not_configured: "Configure Jellyfin for Kodi on this box first.",
    jellyfin_connection_failed: "Jellyfin could not be reached. The saved Kodi account is shown.",
    jellyfin_invalid_response: "Jellyfin returned an unexpected response. The saved Kodi account is shown."
  };
  let timer = 0;
  let pending = false;

  function render(identity) {
    const user = identity.user || "";
    label.textContent = user ? "Jellyfin · " + user : "";
    label.classList.toggle("hidden", !user);
    label.title = identity.source === "configured"
      ? "Account configured in Jellyfin for Kodi"
      : "Account verified by Jellyfin";
    if (!status) return;
    if (identity.linked) {
      status.textContent = "Connected · " + user;
    } else if (identity.reason === "jellyfin_http_error") {
      status.textContent = "Jellyfin returned HTTP " + identity.http_status +
        (user ? ". Saved Kodi account: " + user : ".");
    } else {
      status.textContent = messages[identity.reason] ||
        (user ? "Saved Kodi account: " + user : "No Jellyfin user found.");
    }
  }

  async function refresh() {
    clearTimeout(timer);
    if (pending) return;
    pending = true;
    try {
      render(await TinyPPI.getJSON("/api/jellyfin/local"));
    } catch (_) {
      // Do not leave a stale user attached after the identity endpoint fails.
      label.textContent = "";
      label.classList.add("hidden");
      if (status) status.textContent = "TinyPPI user connection unavailable.";
    } finally {
      pending = false;
      timer = setTimeout(refresh, document.hidden ? 15000 : 10000);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  document.addEventListener("tinyppi-token", refresh);
  refresh();
})();
