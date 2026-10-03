const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {localSnapshot} = require('../resources/web/js/multi-user.js');

// Run the real pre-idle render path: this is what initializes the shelves.
const dashboard = fs.readFileSync(require.resolve('../resources/web/js/dashboard.js'), 'utf8');
const render = dashboard.slice(dashboard.indexOf('function render(next) {'),
  dashboard.indexOf('  if (!next.playing) {', dashboard.indexOf('function render(next) {'))) + '}';
const availability = dashboard.slice(dashboard.indexOf('function tabAvailable(name) {'),
  dashboard.indexOf('/* A Dolby Vision title', dashboard.indexOf('function tabAvailable(name) {')));
const requests = [];
const renderer = {
  state: null, control: false, wasPlaying: null,
  offered: {films: true, series: true}, filmsOffered: true, seriesOffered: true,
  TABS: ['live', 'films', 'series', 'history', 'settings'],
  document: {dispatchEvent: () => {}}, CustomEvent: class {},
  TinyPPI: {panels: {update: () => {}}, metadata: {render: () => {}}},
  el: {metricsGrid: {classList: {toggle: () => {}}}},
  libraryVersion: () => {}, renderTabs: () => {},
  requestFilms: () => requests.push('films'), requestSeries: () => requests.push('series'),
  requestContinue: () => requests.push('continue'),
  hideFilms: () => {}, hideSeries: () => {}, hideContinue: () => {},
};
vm.createContext(renderer);
vm.runInContext(render + availability, renderer);

const sources = [];
const events = {};
const coreContext = {
  testOnState: snapshot => renderer.render(snapshot),
  window: {addEventListener: (name, fn) => { events[name] = fn; }},
  document: {hidden: false, addEventListener: (name, fn) => { events[name] = fn; }, getElementById: () => null},
  localStorage: {getItem: () => null},
  EventSource: class {
    constructor() { sources.push(this); }
    addEventListener() {}
    close() { this.closed = true; }
  },
  URLSearchParams, location: {search: ''}, setTimeout: () => 1, clearTimeout: () => {},
};
// Inject only the renderer callback, avoiding unrelated DOM/localization setup.
const coreSource = fs.readFileSync(require.resolve('../resources/web/js/core.js'), 'utf8')
  .replace('let onState = null;', 'let onState = testOnState;');
vm.runInNewContext(coreSource, coreContext);
const core = coreContext.window.TinyPPI;

events.pageshow();
core.setStreamEnabled(false); // own iframe wins the race, before any SSE state
assert.equal(sources.length, 1);
assert.equal(sources[0].closed, true);
assert.deepEqual(requests, [], 'Reproduces empty shelves before a snapshot arrives');

const own = 'http://192.168.1.15:8099';
const sender = {};
const box = {origin: own, frame: {contentWindow: sender}};
const snapshot = {playing: true, control: true, library: 3, groups: []};
const event = {origin: own, source: sender, data: {type: 'tinyppi-box', snapshot}};
assert.equal(core.receiveSharedState(localSnapshot(box, event, own)), true);
assert.deepEqual(requests, ['films', 'series', 'continue']);
assert.equal(renderer.tabAvailable('series'), true);
assert.equal(renderer.tabAvailable('films'), true);
assert.equal(renderer.tabAvailable('history'), true);
assert.equal(renderer.state, snapshot, 'History receives the own box state too');
assert.equal(sources.length, 1, 'Sharing state must not reopen a duplicate SSE connection');

for (const forged of [{...event, source: {}}, {...event, origin: 'http://other:8099'},
  {...event, data: {snapshot: {playing: true}}}]) {
  assert.equal(localSnapshot(box, forged, own), null);
}
assert.equal(localSnapshot({...box, origin: 'http://other:8099'}, event, own), null);
for (const malformed of [null, {}, [], {playing: true}]) {
  assert.equal(core.receiveSharedState(malformed), false);
}
core.setStreamEnabled(true);
assert.equal(core.receiveSharedState(snapshot), false, 'Standalone pages retain their own state owner');
assert.equal(sources.length, 2);
console.log('Multi-box startup race, library/history initialization and sender isolation: all tests passed.');
