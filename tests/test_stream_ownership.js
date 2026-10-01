const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const events = {};
const sources = [];
class EventSource {
  constructor() { this.closed = false; sources.push(this); }
  addEventListener() {}
  close() { this.closed = true; }
}
const storage = {getItem:()=>null};
const context = {
  window: {addEventListener:(key, cb)=>{events[key]=cb;}},
  document: {hidden:false, addEventListener:(key,cb)=>{events[key]=cb;}, getElementById:()=>null, dispatchEvent:()=>{}},
  CustomEvent: class {},
  localStorage:storage, EventSource, clearTimeout:()=>{}, setTimeout:()=>1,
  URLSearchParams, location:{search:''},
};
vm.runInNewContext(fs.readFileSync(require.resolve('../resources/web/js/core.js'), 'utf8'), context);
const core = context.window.TinyPPI;
events.pageshow();
assert.equal(sources.length, 1);
core.setStreamEnabled(false);
assert.equal(sources[0].closed, true);
events.pageshow();
events.visibilitychange();
events.storage({key:'tinyppi.token', storageArea:storage, newValue:''});
assert.equal(sources.length, 1, 'Outer multi-user page must not reopen its duplicate stream');
core.setStreamEnabled(true);
assert.equal(sources.length, 2);
core.setStreamEnabled(true);
assert.equal(sources.length, 2, 'Repeated enable must not create extra streams');
events.pagehide();
assert.equal(sources[1].closed, true);
console.log('Single stream ownership: all tests passed.');
