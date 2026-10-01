// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

/* Each box renders its own original live dashboard: measurements and controls
   never get reconstructed from Jellyfin metadata or sent to another player. */
(function () {
  function origins(text, own) {
    const result = [];
    for (const value of text.split(/[\s,]+/).filter(Boolean)) {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Use dashboard addresses only, e.g. http://192.168.1.100:8099');
      }
      if (url.origin !== own && !result.includes(url.origin)) result.push(url.origin);
    }
    if (result.length > 12) throw new Error('Maximum 12 extra boxes.');
    return result;
  }
  if (typeof module !== 'undefined') { module.exports = { origins }; return; }
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  const panel = document.getElementById('tab-live');
  if (!panel) return;
  if (embedded) {
    document.documentElement.classList.add('tinyppi-embedded');
    let target;
    try { target = new URL(document.referrer).origin; } catch (_) { return; }
    let playing = null;
    let user = '';
    function report() {
      if (playing === null) {
        const idle = document.getElementById('idleCard');
        if (idle && !idle.classList.contains('hidden')) playing = false;
        else if (document.getElementById('title').textContent !== '—') playing = true;
      }
      parent.postMessage({type: 'tinyppi-box', playing, user,
        connected: document.getElementById('status').dataset.state === 'live',
        height: Math.ceil(panel.getBoundingClientRect().height) + 24,
        version: document.getElementById('version').textContent}, target);
    }
    document.addEventListener('tinyppi-state', (event) => {
      playing = !!event.detail.playing;
    });
    document.addEventListener('tinyppi-user', (event) => { user = event.detail || ''; });
    new ResizeObserver(report).observe(panel);
    setInterval(report, 2000);
    report();
    return;
  }
  const storageKey = 'tinyppi.dashboard.boxes';
  const input = document.getElementById('dashboardBoxes');
  const note = document.getElementById('dashboardBoxesStatus');
  const row = document.createElement('div');
  row.className = 'user-dashboards';
  row.setAttribute('aria-label', 'Jellyfin users');
  const summary = document.createElement('p');
  summary.className = 'user-dashboards-summary';
  panel.append(summary, row);
  let boxes = [];
  function describe() {
    summary.textContent = boxes.map((box) => (box.user || box.label) + ' · ' +
      (Date.now() - box.updated > 12000 ? 'Offline / connecting' :
        box.connected === false ? 'Disconnected' :
        box.playing === true ? 'Playing' : box.playing === false ? 'Idle' : 'Connecting')).join('   |   ');
  }
  function configure(text) {
    const addresses = origins(text, location.origin);
    for (const box of boxes) box.frame.remove();
    boxes = [];
    document.documentElement.classList.toggle('tinyppi-multi', addresses.length > 0);
    if (!addresses.length) { summary.textContent = ''; return; }
    for (const address of [location.origin, ...addresses]) {
      const frame = document.createElement('iframe');
      frame.title = 'TinyPPI · ' + new URL(address).hostname;
      frame.src = address + '/?embedded=1#live';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.className = 'user-dashboard';
      const box = {frame, origin: address, label: new URL(address).hostname,
        updated: 0, playing: null, user: ''};
      boxes.push(box);
      row.append(frame);
    }
    describe();
  }
  addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'tinyppi-box') return;
    const box = boxes.find((item) => item.origin === event.origin &&
      item.frame.contentWindow === event.source);
    if (!box) return;
    box.updated = Date.now();
    box.playing = event.data.playing;
    box.connected = event.data.connected;
    box.user = typeof event.data.user === 'string' ? event.data.user.slice(0, 120) : '';
    if (Number.isFinite(event.data.height)) {
      box.frame.style.height = Math.min(12000, Math.max(400, event.data.height)) + 'px';
    }
    // Keep idle players reachable, but only active users occupy the live row.
    box.frame.classList.toggle('box-idle', box.playing === false);
    box.frame.title = 'TinyPPI · ' + (box.user || box.label);
    describe();
  });
  try { input.value = localStorage.getItem(storageKey) || ''; configure(input.value); }
  catch (error) { note.textContent = error.message; }
  document.getElementById('dashboardBoxesSave').addEventListener('click', () => {
    try {
      origins(input.value, location.origin);
      localStorage.setItem(storageKey, input.value.trim());
      configure(input.value);
      note.textContent = 'Saved on this browser. Open Live to see active users. Each box needs TinyPPI 2.13.3 or newer.';
    } catch (error) { note.textContent = error.message; }
  });
  setInterval(describe, 4000);
})();
