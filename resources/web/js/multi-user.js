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
  function accentValue(value) {
    const text = String(value || '').trim();
    const painted = /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i.exec(text);
    const parts = (painted ? painted.slice(1, 4) : text.split(','))
      .map((part) => part.trim());
    return parts.length === 3 && parts.every((part) => /^(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/.test(part))
      ? parts.join(', ') : '';
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
  if (typeof module !== 'undefined') { module.exports = { origins, isMainDashboard, activeBox, needsRetry, localSnapshot, accentValue }; return; }
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
    tokenButton.className = 'tab embedded-token-tab';
    const tokenIcon = document.createElement('span');
    tokenIcon.className = 'tabicon';
    const keyIcon = document.createElement('span');
    keyIcon.className = 'ui-icon painted icon-key';
    const tokenLabel = document.createElement('span');
    tokenLabel.className = 'tablabel';
    tokenLabel.textContent = 'Token';
    tokenIcon.append(keyIcon, tokenLabel);
    tokenButton.append(tokenIcon);
    tokenButton.title = 'Token voor deze box invoeren';
    tokenButton.addEventListener('click', () => TinyPPI.askToken());
    navigation.append(tokenButton);
    let target;
    try { target = new URL(document.referrer).origin; } catch (_) { target = null; }
    let playing = null;
    let snapshot = null;
    let user = '';
    addEventListener('message', (event) => {
      // Only the actual embedding parent may open this box's local dialog.
      // No credentials cross the frame boundary.
      if (target && event.source === parent && event.origin === target &&
          event.data?.type === 'tinyppi-ask-token') TinyPPI.askToken();
    });
    /* A horizontal gesture starts inside this iframe, so the outer carousel
       does not reliably receive it (especially after its first snap in
       WebKit).  Report a completed, predominantly horizontal swipe to the
       parent and let the parent move the user carousel. */
    let swipeStart = null;
    document.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) { swipeStart = null; return; }
      const touch = event.touches[0];
      swipeStart = {x: touch.clientX, y: touch.clientY};
    }, {passive: true});
    document.addEventListener('touchend', (event) => {
      if (!swipeStart || event.changedTouches.length !== 1) { swipeStart = null; return; }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - swipeStart.x;
      const dy = touch.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      if (target) parent.postMessage({type: 'tinyppi-user-swipe', direction: dx < 0 ? 1 : -1}, target);
    }, {passive: true});
    document.addEventListener('touchcancel', () => { swipeStart = null; }, {passive: true});
    function report() {
      user = document.querySelector('.jellyfin-user')?.textContent || user;
      userHeading.textContent = user || (TinyPPI.relayOrigin ? TinyPPI.relayOrigin + ' · via deze Cube' : location.host);
      if (playing === null) {
        const idle = document.getElementById('idleCard');
        if (idle && !idle.classList.contains('hidden')) playing = false;
        else if (document.getElementById('title').textContent !== '—') playing = true;
      }
      /* Copy what WebKit actually painted on the selected key.  Reading the
         intermediate custom property can yield its unresolved var() text in
         an iframe even though the button on screen already has the right
         colour. */
      const selected = navigation.querySelector('.tab.on .tabicon');
      const accent = accentValue(selected && getComputedStyle(selected).backgroundColor);
      if (target) parent.postMessage({type: 'tinyppi-box', playing, user, accent,
        needsToken: document.getElementById('statusText').textContent === TinyPPI.T.token_bad,
        tokenDialogOpen: !!document.getElementById('tokenDialog')?.open,
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
    document.addEventListener('tinyppi-tint', report);
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
  let relayOrigins = [];
  const row = document.createElement('div');
  row.className = 'user-dashboards';
  row.setAttribute('aria-label', 'Jellyfin users');
  const summary = document.createElement('p');
  summary.className = 'user-dashboards-summary';
  panel.append(summary, row);
  let boxes = [];
  function paintChrome(active) {
    const accent = active.map((box) => box.accent).find(Boolean) || '';
    for (const host of [document.querySelector('.topbar'), document.querySelector('.tabbar')]) {
      if (!host) continue;
      if (accent) {
        host.style.setProperty('--cover-accent-rgb', accent);
        /* WebKit does not always recompute a var() chain on an outer page
           after the value arrived from an embedded frame.  Put the two
           tokens the selected tab actually paints on the host as well. */
        host.style.setProperty('--accent', `rgb(${accent})`);
        host.style.setProperty('--accent-2', `rgb(${accent})`);
      } else {
        for (const name of ['--cover-accent-rgb', '--accent', '--accent-2']) {
          host.style.removeProperty(name);
        }
      }
    }
  }
  function describe() {
    const now = Date.now();
    const active = boxes.filter((box) => activeBox(box, now));
    for (const box of boxes) {
      const visible = active.includes(box) || box.authorizing || box.needsToken || box.tokenDialogOpen;
      box.frame.classList.toggle('box-idle', !visible);
      box.frame.inert = !visible;
      box.frame.setAttribute('aria-hidden', String(!visible));
    }
    row.classList.toggle('single-user', active.length === 1);
    paintChrome(active);
    summary.textContent = active.length ? '' : 'Geen actieve gebruikers';
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
    for (const box of boxes) box.frame.remove();
    boxes = [];
    document.documentElement.classList.toggle('tinyppi-multi', addresses.length > 0);
    if (!addresses.length) { summary.textContent = ''; return; }
    for (const address of [location.origin, ...addresses]) {
      const frame = document.createElement('iframe');
      frame.title = 'TinyPPI · ' + new URL(address).hostname;
      const relayed = relayOrigins.includes(address) && address !== location.origin;
      const frameURL = relayed ? '/?embedded=1&' + new URLSearchParams({relay: address}) + '#live' : address + '/?embedded=1#live';
      frame.src = frameURL;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.className = 'user-dashboard box-idle';
      frame.inert = true;
      frame.setAttribute('aria-hidden', 'true');
      const box = {frame, origin: address, transportOrigin: relayed ? location.origin : address,
        frameURL, label: new URL(address).hostname,
        updated: 0, attempted: Date.now(), playing: null, user: ''};
      boxes.push(box);
      if (address !== location.origin) {
        const boxCard = document.createElement('div');
        boxCard.className = 'dashboard-box-item';
        const boxInfo = document.createElement('div');
        boxInfo.className = 'dashboard-box-info';
        const boxIcon = document.createElement('span');
        boxIcon.className = 'dashboard-box-icon';
        boxIcon.setAttribute('aria-hidden', 'true');
        const boxName = document.createElement('span');
        boxName.className = 'dashboard-box-name';
        boxName.textContent = box.label;
        const boxState = document.createElement('span');
        boxState.className = 'dashboard-box-state';
        boxState.textContent = 'Niet gekoppeld';
        boxInfo.append(boxIcon, boxName, boxState);
        const actions = document.createElement('div');
        actions.className = 'dashboard-box-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'setbtn dashboard-box-button primary';
        button.textContent = 'Token instellen';
        button.addEventListener('click', () => {
          box.authorizing = true;
          location.hash = 'live';
          describe();
          box.frame.scrollIntoView({block: 'start'});
          box.frame.contentWindow.postMessage({type: 'tinyppi-ask-token'}, box.transportOrigin);
        });
        actions.append(button);
        if (/^http:\/\/100\./.test(address)) {
          const relayButton = document.createElement('button');
          relayButton.type = 'button';
          relayButton.className = 'setbtn dashboard-box-button';
          relayButton.textContent = relayed ? 'Koppeltoken wijzigen' : 'Via deze Cube bekijken';
          relayButton.addEventListener('click', () => TinyPPI.configureRelay(address));
          actions.append(relayButton);
        }
        boxCard.append(boxInfo, actions);
        tokens.append(boxCard);
      }
      row.append(frame);
    }
    describe();
  }
  addEventListener('message', (event) => {
    if (!event.data) return;
    const box = boxes.find((item) => item.transportOrigin === event.origin &&
      item.frame.contentWindow === event.source);
    if (!box) return;
    if (event.data.type === 'tinyppi-user-swipe') {
      const active = boxes.filter((item) => activeBox(item, Date.now()));
      const current = active.indexOf(box);
      const direction = event.data.direction === -1 ? -1 : 1;
      const next = current < 0 ? -1 : Math.max(0, Math.min(active.length - 1, current + direction));
      if (next >= 0 && next !== current) {
        row.scrollTo({left: active[next].frame.offsetLeft - row.offsetLeft, behavior: 'smooth'});
      }
      return;
    }
    if (event.data.type !== 'tinyppi-box') return;
    box.updated = Date.now();
    box.playing = event.data.playing;
    box.connected = event.data.connected;
    box.needsToken = event.data.needsToken === true;
    box.tokenDialogOpen = event.data.tokenDialogOpen === true;
    if (box.tokenDialogOpen || box.connected) box.authorizing = false;
    box.user = typeof event.data.user === 'string' ? event.data.user.slice(0, 120) : '';
    box.accent = accentValue(event.data.accent);
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
      relayOrigins = hello.relay_origins || [];
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
        box.frame.src = box.frameURL;
      }
    }
  }, 4000);
})();
