// SPDX-License-Identifier: AGPL-3.0-or-later
"use strict";

(function () {
  const unknown = 'Niet gemeld';
  function resolution(width, height) { return width && height ? width + ' × ' + height : unknown; }
  function rate(bits) { return Number.isFinite(bits) && bits > 0 ? (bits / 1000000).toFixed(1) + ' Mb/s' : unknown; }
  function selected(sessions) {
    return (Array.isArray(sessions) ? sessions : []).filter(s => s && s.infuse && /infuse/i.test(s.client || ''));
  }
  if (typeof module !== 'undefined') { module.exports = {selected, resolution, rate}; return; }
  if (!window.TinyPPI || new URLSearchParams(location.search).get('embedded') === '1') return;
  const panel = document.getElementById('tab-live');
  if (!panel) return;
  const host = document.createElement('section');
  host.className = 'infuse-sessions';
  host.setAttribute('aria-label', 'Infuse-sessies via Jellyfin');
  panel.append(host);
  let enabled = false;
  let pending = false;
  let timer;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function block(title, pairs) {
    const section = element('section', 'infuse-metrics');
    section.append(element('h3', '', title));
    const list = element('dl');
    for (const [label, value] of pairs) {
      list.append(element('dt', '', label), element('dd', '', value === null || value === undefined || value === '' ? unknown : value));
    }
    section.append(list);
    return section;
  }
  function card(session) {
    const data = session.infuse;
    const source = data.source;
    const server = data.server;
    const article = element('article', 'infuse-session');
    const hero = element('div', 'infuse-hero');
    if (session.image_item) {
      const image = element('img', 'infuse-poster');
      image.alt = '';
      image.loading = 'lazy';
      image.src = TinyPPI.withToken('/api/jellyfin/art?kind=primary&item=' + encodeURIComponent(session.image_item));
      hero.append(image);
    }
    const heading = element('div', 'infuse-heading');
    heading.append(element('b', '', session.user), element('h2', '', session.title),
      element('p', '', [session.series, session.episode].filter(Boolean).join(' · ')),
      element('p', '', session.client + (session.device ? ' · ' + session.device : '')));
    hero.append(heading);
    const progress = element('progress');
    progress.max = 100;
    progress.value = session.progress || 0;
    progress.setAttribute('aria-label', 'Afspeelvoortgang');
    const grid = element('div', 'infuse-grid');
    grid.append(block('Bronbestand · Jellyfin', [
      ['Video', source.codec], ['Resolutie', resolution(source.width, source.height)],
      ['Bron-framerate', source.frame_rate ? source.frame_rate + ' fps' : unknown],
      ['Bitdiepte', source.bit_depth ? source.bit_depth + '-bit' : unknown],
      ['HDR in bestand', source.range], ['Bestandsbitrate', rate(source.bitrate)],
      ['Container', source.container], ['Audio', [source.audio_codec, source.audio_channels].filter(Boolean).join(' · ')],
      ['Audiotaal', source.audio_language]
    ]), block('Infuse-sessie · gemeld aan Jellyfin', [
      ['Status', session.paused ? 'Gepauzeerd' : 'Speelt'], ['Afspeelmethode', session.method === 'Unknown' ? unknown : session.method],
      ['Voortgang', session.position + ' / ' + session.duration], ['Resterend', session.remaining],
      ['Verwachte beeldmodus', data.output.expected],
      ['HDMI-uitvoer', 'Niet bevestigd'],
      ['Audiotrack-index', data.session.audio_index],
      ['Ondertiteling', data.session.subtitle_index === -1 ? 'Uit' : source.subtitle],
      ['Spoelen toegestaan', data.session.can_seek === true ? 'Ja' : data.session.can_seek === false ? 'Nee' : unknown]
    ]), block('Jellyfin-server · transcodering', server.transcoding ? [
      ['Video-uitvoer server', server.video_codec], ['Audio-uitvoer server', server.audio_codec],
      ['Resolutie serverstream', resolution(server.width, server.height)], ['Streambitrate', rate(server.bitrate)],
      ['Encodersnelheid (geen scherm-fps)', server.encoder_fps === null || server.encoder_fps === undefined ? unknown : server.encoder_fps + ' fps'],
      ['Redenen', (server.reasons || []).join(', ')]
    ] : [['Transcodering', 'Geen transcodegegevens gemeld']]));
    article.append(hero, progress, element('p', 'infuse-timing', session.position + ' / ' + session.duration), grid,
      element('p', 'infuse-note', 'Brongegevens en sessiestatus via Jellyfin. Apple TV HDMI-uitvoer, dropped frames, CPU, temperatuur en decoderbuffers zijn niet beschikbaar via Infuse.'));
    return article;
  }
  function announce(count) {
    document.dispatchEvent(new CustomEvent('tinyppi-infuse-count', {detail: count}));
  }
  async function refresh() {
    clearTimeout(timer);
    if (!enabled || pending) return;
    pending = true;
    try {
      const response = await TinyPPI.getJSON('/api/jellyfin');
      if (response.reason) throw new Error('unavailable');
      const sessions = selected(response.sessions);
      host.replaceChildren(...sessions.map(card));
      announce(sessions.length);
    } catch (_) {
      // Never leave stale sessions or progress on screen after a failed poll.
      const previouslyVisible = host.childElementCount > 0;
      host.replaceChildren();
      if (previouslyVisible) host.append(element('p', 'infuse-note', 'Infuse-sessies tijdelijk niet beschikbaar via Jellyfin.'));
      announce(0);
    } finally {
      pending = false;
      timer = setTimeout(refresh, document.hidden ? 15000 : 5000);
    }
  }
  TinyPPI.getJSON('/api/hello').then(hello => {
    enabled = hello.main_dashboard === true;
    if (enabled) refresh();
  }).catch(() => {});
  document.addEventListener('tinyppi-token', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
