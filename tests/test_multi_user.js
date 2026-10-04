const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {origins, isMainDashboard, activeBox, needsRetry} = require('../resources/web/js/multi-user.js');
const now = 100000;
const active = {playing:true, connected:true, updated:99000, attempted:70000};
assert.equal(activeBox(active, now), true);
for (const change of [{playing:false}, {playing:null}, {connected:false}, {updated:88000}]) {
  assert.equal(activeBox({...active, ...change}, now), false);
}
assert.equal(needsRetry(active, now), false);
assert.equal(needsRetry({...active, updated:0}, now), true);
assert.equal(needsRetry({...active, updated:0, attempted:99000}, now), false);
assert.equal(isMainDashboard({main_dashboard:true}), true);
for (const hello of [null, {}, {main_dashboard:false}, {main_dashboard:'true'}]) {
  assert.equal(isMainDashboard(hello), false);
}
assert.deepEqual(origins('http://192.168.1.100:8099\nhttp://192.168.1.100:8099/', 'http://192.168.1.15:8099'), ['http://192.168.1.100:8099']);
assert.deepEqual(origins('http://192.168.1.15:8099', 'http://192.168.1.15:8099'), []);
assert.deepEqual(origins('', 'http://192.168.1.15:8099'), []);
for (const input of ['javascript:alert(1)', 'file:///etc/passwd', 'http://user:secret@box/', 'http://box/path', 'http://box/?token=secret', 'http://box/#live']) {
  assert.throws(() => origins(input, 'http://192.168.1.15:8099'));
}
assert.throws(() => origins(Array.from({length:13}, (_, i) => `http://box${i}`).join('\n'), 'http://local'));
const web = path.join(__dirname, '../resources/web');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
assert.ok(!html.includes('/js/infuse-sessions.js'), 'Dashboard must not load or poll Apple TV/Infuse cards');
assert.ok(html.includes('/js/multi-user.js'), 'CoreELEC cards remain enabled');
const multi = fs.readFileSync(path.join(web, 'js/multi-user.js'), 'utf8');
assert.ok(!multi.includes('tinyppi-infuse-count'), 'Idle summary must only count configured CoreELEC boxes');
assert.ok(multi.includes('receiveSharedState(snapshot)'), 'Keep the Safari shared-state fix');
console.log('Multi-user address validation: all tests passed.');
