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
  function isMainDashboard(hello) { return !!hello && hello.main_dashboard === true; }
  function activeBox(box, now) {
    return box.playing === true && box.connected === true && now - box.updated < 12000;
  }
  function needsRetry(box, now) {
    return now - box.updated >= 12000 && now - box.attempted >= 30000;
  }
  function localSnapshot(box, event, own) {
    // Only the configured own frame may populate the outer box's library and
    // statistics. Never accept another user's player state or a forged sender.
    if (!box || box.origin !== own || event.origin !== own ||
        box.frame.contentWindow !== event.source) return null;
    const snapshot = event.data && event.data.snapshot;
    return snapshot && typeof snapshot.playing === 'boolean' &&
      typeof snapshot.control === 'boolean' ? snapshot : null;
  }
  if (typeof module !== 'undefined') { module.exports = { origins, isMainDashboard, activeBox, needsRetry, localSnapshot }; return; }
  const embedded = new URLSearchParams(location.search).get('embedded') === '1';
  const panel = document.getElementById('tab-live');
  if (!panel) return;
  if (embedded) {
    document.documentElement.classList.add('tinyppi-embedded');
    const main = document.querySelector('main');
    const navigation = document.getElementById('tabBar');
    main.before(navigation);
    const userHeading = document.createElement('b');
    userHeading.className = 'embedded-user';
    document.querySelector('.topbar').prepend(userHeading);
    const tokenButton = document.createElement('button');
    tokenButton.type = 'button';
    tokenButton.className = 'setbtn';
    tokenButton.textContent = 'Token';
    tokenButton.title = 'Token voor deze box invoeren';
    tokenButton.addEventListener('click', () => TinyPPI.askToken());
    navigation.append(tokenButton);
    let target;
    try { target = new URL(document.referrer).origin; } catch (_) { target = null; }
    let playing = null;
    let snapshot = null;
    let user = '';
    function report() {
      user = document.querySelector('.jellyfin-user')?.textContent || user;
      userHeading.textContent = user;
      if (playing === null) {
        const idle = document.getElementById('idleCard');
        if (idle && !idle.classList.contains('hidden')) playing = false;
        else if (document.getElementById('title').textContent !== '—') playing = true;
      }
      if (target) parent.postMessage({type: 'tinyppi-box', playing, user,
        connected: document.getElementById('status').dataset.state === 'live',
        height: Math.ceil(main.getBoundingClientRect().height +
          navigation.getBoundingClientRect().height +
          document.querySelector('.topbar').getBoundingClientRect().height) + 24,
        version: document.getElementById('version').textContent,
        snapshot: target === location.origin ? snapshot : null}, target);
    }
    document.addEventListener('tinyppi-state', (event) => {
      playing = !!event.detail.playing;
      snapshot = event.detail.snapshot || null;
    });
    document.addEventListener('tinyppi-user', (event) => { user = event.detail || ''; });
    new ResizeObserver(report).observe(main);
    setInterval(report, 2000);
    report();
    return;
  }
  const storageKey = 'tinyppi.dashboard.boxes';
  const input = document.getElementById('dashboardBoxes');
  const note = document.getElementById('dashboardBoxesStatus');
  const settingsCard = document.getElementById('dashboardBoxesCard');
  const tokens = document.getElementById('dashboardBoxTokens');
  let mainDashboard = false;
  const row = document.createElement('div');
  row.className = 'user-dashboards';
  row.setAttribute('aria-label', 'Jellyfin users');
  const summary = document.createElement('p');
  summary.className = 'user-dashboards-summary';
  panel.append(summary, row);
  let boxes = [];
  let infuseCount = 0;
  document.addEventListener('tinyppi-infuse-count', event => {
    infuseCount = Number.isInteger(event.detail) && event.detail > 0 ? event.detail : 0;
    describe();
  });
  function describe() {
    const now = Date.now();
    const active = boxes.filter((box) => activeBox(box, now));
    for (const box of boxes) {
      const visible = active.includes(box);
      box.frame.classList.toggle('box-idle', !visible);
      box.frame.inert = !visible;
      box.frame.setAttribute('aria-hidden', String(!visible));
    }
    row.classList.toggle('single-user', active.length === 1);
    summary.textContent = active.length || infuseCount ? '' : 'Geen actieve gebruikers';
    if (boxes.length) {
      const connected = boxes.some((box) => box.connected === true && now - box.updated < 12000);
      TinyPPI.setStatus(connected ? 'live' : 'wait', connected ? TinyPPI.T.connected : TinyPPI.T.connecting);
    }
  }
  function configure(text) {
    const addresses = mainDashboard ? origins(text, location.origin) : [];
    // In multi-box mode the own embedded card already owns the local stream.
    // The outer dashboard must not consume a second server slot.
    TinyPPI.setStreamEnabled(addresses.length === 0);
    tokens.replaceChildren();
    for (const address of addresses) {
      const link = document.createElement('a');
      link.className = 'setbtn';
      link.href = address + '/#settings';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = new URL(address).hostname + ' · Token invoeren op deze box';
      tokens.append(link);
    }
    for (const box of boxes) box.frame.remove();
    boxes = [];
    document.documentElement.classList.toggle('tinyppi-multi', addresses.length > 0);
    if (!addresses.length) { summary.textContent = ''; return; }
    for (const address of [location.origin, ...addresses]) {
      const frame = document.createElement('iframe');
      frame.title = 'TinyPPI · ' + new URL(address).hostname;
      frame.src = address + '/?embedded=1#live';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.className = 'user-dashboard box-idle';
      frame.inert = true;
      frame.setAttribute('aria-hidden', 'true');
      const box = {frame, origin: address, label: new URL(address).hostname,
        updated: 0, attempted: Date.now(), playing: null, user: ''};
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
    const snapshot = localSnapshot(box, event, location.origin);
    if (snapshot) TinyPPI.receiveSharedState(snapshot);
    if (Number.isFinite(event.data.height)) {
      box.frame.style.height = Math.min(12000, Math.max(400, event.data.height)) + 'px';
    }
    // Keep idle players reachable, but only active users occupy the live row.
    box.frame.title = 'TinyPPI · ' + (box.user || box.label);
    describe();
  });
  async function initialiseRole() {
    try {
      const hello = await TinyPPI.getJSON('/api/hello');
      mainDashboard = isMainDashboard(hello);
      settingsCard.classList.toggle('hidden', !mainDashboard);
      const fallback = (hello.dashboard_trust || []).join('\n');
      try { input.value = localStorage.getItem(storageKey) || fallback; } catch (_) { input.value = fallback; }
      configure(input.value);
    } catch (error) {
      mainDashboard = false;
      settingsCard.classList.add('hidden');
      configure('');
      note.textContent = error.message;
    }
  }
  initialiseRole();
  document.getElementById('dashboardBoxesSave').addEventListener('click', async () => {
    if (!mainDashboard) return;
    try {
      origins(input.value, location.origin);
      await TinyPPI.saveDashboardTrust(input.value.trim());
      try { localStorage.setItem(storageKey, input.value.trim()); } catch (_) {}
      note.textContent = 'Opgeslagen. Laat elke andere box dit hoofd-dashboard vertrouwen in de addoninstellingen.';
      location.reload();
    } catch (error) { note.textContent = error.message; }
  });
  setInterval(() => {
    describe();
    const now = Date.now();
    for (const box of boxes) {
      if (needsRetry(box, now)) {
        box.attempted = now;
        box.frame.src = box.origin + '/?embedded=1#live';
      }
    }
  }, 4000);
})();
