const assert = require('node:assert/strict');
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
console.log('Multi-user address validation: all tests passed.');
