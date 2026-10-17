# Viewing a remote box through the main dashboard

TinyPPI 2.16.4 can optionally relay a remote box's live card and controls through the main
CoreELEC dashboard. At home, the browser only needs access to the main Cube's
LAN address. Both CoreELEC boxes still need working Tailscale connections.
Away from home, reaching the main Cube still requires a suitable private route.

1. Update the main Cube to this fork's 2.16.4 or later and refresh the browser.
2. Open the main dashboard using its LAN address and enter **its own** TinyPPI token.
3. In Settings, save the remote address in the boxes list, for example
   `http://100.76.102.114:8099`.
4. Choose **Bekijken via deze Cube** beside that address. Enter the **remote
   box's** TinyPPI dashboard token in the labelled dialog.
5. The page reloads. When the remote box is playing, its card appears. Playback,
   seeking, chapters, volume/mute, audio/subtitle tracks and VS10 controls work
   when enabled on that remote box. Existing 2.16.3 links retain their saved token.

The remote box need not be updated just for relay support: its existing state,
identity and artwork APIs are used. Only the main Cube needs the relay feature.
No router port forwarding or exit node is required.

## Boundaries

- Explicitly saved targets only: numeric Tailscale IPv4 addresses in
  `100.64.0.0/10`, HTTP port 8099. No DNS names, public addresses or LAN targets.
- The relay always requires the main Cube's token or read session, even if
  ordinary local reads are anonymous. Saving a remote token requires the token
  header; a read session is insufficient. Control also requires the main token
  header; the remote box independently enforces its own control setting and token.
- Remote credentials are stored in `dashboard-relay.json` in the add-on data
  directory, atomically with mode 0600. They are never returned through an API,
  put in a URL, or substituted for the main Cube's token. Treat backups of this
  directory as sensitive.
- Only live state, the local Jellyfin identity and current artwork are read.
  Only the fixed `/api/command` and `/api/mode` write endpoints are forwarded,
  with the selected remote token. No remote HTML/scripts, redirects, streams,
  library writes or arbitrary paths are proxied. Requests are size-, concurrency-
  and time-bounded. Failed commands are never retried or run on the local player.
- Disabling the main-dashboard role or removing an address from the saved
  trusted-box list stops relay access to it. The saved credential remains on
  disk until replaced or the configuration file is removed by the administrator.
- Relay status updates poll approximately every 2.5 seconds, with slower
  retries after outages. Remote state never supplies the main box's library or
  history. The metadata view uses the remote live snapshot, not local history.

The browser-to-Cube LAN connection uses HTTP, as the existing dashboard does.
Only use it on a trusted LAN. Cube-to-remote traffic uses Tailscale encryption.
