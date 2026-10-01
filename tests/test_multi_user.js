const assert = require('node:assert/strict');
const {origins, isMainDashboard} = require('../resources/web/js/multi-user.js');
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
