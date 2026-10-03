const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {selected, resolution, rate} = require('../resources/web/js/infuse-sessions.js');
assert.deepEqual(selected(null), []);
assert.deepEqual(selected([{client:'Kodi'}, {client:'Infuse', infuse:{}}]).map(s=>s.client), ['Infuse']);
assert.equal(resolution(null, null), 'Niet gemeld');
assert.equal(rate(10000000), '10.0 Mb/s');
assert.equal(rate(null), 'Niet gemeld');
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.attrs = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attrs[key] = value; }
  get childElementCount() { return this.children.length; }
}
const code = fs.readFileSync(require.resolve('../resources/web/js/infuse-sessions.js'), 'utf8');
function text(node) { return [node.textContent, ...node.children.map(text)].join(' '); }
async function run(main, embedded) {
  const panel = new Node('main');
  const events = {};
  const counts = [];
  const calls = [];
  let failure = false;
  const session = {client:'Infuse', user:'<img src=x onerror=alert(1)>', title:'Movie', device:'Apple TV',
    image_item:'film&token=secret', method:'Unknown', progress:15, position:'10:00', duration:'60:00', remaining:'50:00',
    infuse:{source:{codec:'hevc', range:'Dolby Vision Profile 7'}, session:{}, server:{transcoding:false},
      output:{expected:'HDR10-fallback verwacht', confirmed:false}}};
  const api = {getJSON:async url=>{
    calls.push(url);
    if (url === '/api/hello') return {main_dashboard:main};
    if (failure) throw new Error('offline');
    return {sessions:[session]};
  }, withToken: url=>url};
  vm.runInNewContext(code, {window:{TinyPPI:api}, TinyPPI:api, location:{search:embedded?'?embedded=1':''},
    URLSearchParams, setTimeout:()=>1, clearTimeout:()=>{},
    CustomEvent:class {constructor(type, options) {this.type=type;this.detail=options.detail;}},
    document:{hidden:false, getElementById:()=>panel, createElement:tag=>new Node(tag),
      addEventListener:(name,cb)=>events[name]=cb, dispatchEvent:event=>counts.push(event.detail)}});
  await new Promise(resolve=>setImmediate(resolve));
  if (!main || embedded) { assert.equal(calls.includes('/api/jellyfin'), false); return; }
  const host = panel.children[0];
  assert.equal(host.children.length, 1);
  assert.ok(text(host).includes('Niet bevestigd'));
  assert.ok(text(host).includes('HDR10-fallback verwacht'));
  assert.ok(text(host).includes('<img src=x onerror=alert(1)>'), 'Untrusted names remain literal text');
  const image = host.children[0].children[0].children[0];
  assert.ok(image.src.includes('film%26token%3Dsecret'), 'Item ID cannot inject query parameters');
  assert.deepEqual(counts, [1]);
  failure = true;
  await events['tinyppi-token']();
  assert.equal(host.children[0].tag, 'p', 'Stale card is removed on connection failure');
  assert.deepEqual(counts, [1, 0]);
}
(async ()=>{
  await run(true, false); await run(false, false); await run(true, true);
  console.log('Infuse cards, roles, fallback provenance and stale-state tests passed.');
})().catch(error=>{console.error(error); process.exitCode=1;});
