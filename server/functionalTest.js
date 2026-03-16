const http = require('http');

const API = 'http://localhost:4000';

function request(path, opts={}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const headers = opts.headers || {};
    const data = opts.body ? JSON.stringify(opts.body) : null;
    if (data) headers['Content-Type'] = 'application/json';
    const req = http.request(url, { method: opts.method || 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log('1) login admin');
    const login = await request('/auth/login', { method: 'POST', body: { identifier: 'admin@admin.com', password: 'admin' } });
    if (login.status !== 200) throw new Error('login failed ' + login.status + ' ' + login.body);
    const token = login.json.token;
    console.log(' token', token?.slice(0, 20) + '...');

    console.log('2) create evaluator');
    const evEmail = `eval${Date.now()}@test.local`;
    const createEval = await request('/users', { method: 'POST', body: { institutional_email: evEmail, password: 'secret', full_name: 'Eval Test' }, headers: { Authorization: `Bearer ${token}` } });
    if (createEval.status !== 200) throw new Error('create evaluator failed ' + createEval.status + ' ' + createEval.body);
    const evaluatorId = createEval.json.id;
    console.log(' evaluator id', evaluatorId);

    console.log('3) create thesis');
    const createThesis = await request('/theses', { method: 'POST', body: { title: 'Func Test Tesis '+Date.now(), abstract:'x', keywords:'x' }, headers: { Authorization: `Bearer ${token}` } });
    if (createThesis.status !== 200) throw new Error('create thesis failed ' + createThesis.status + ' ' + createThesis.body);
    const thesisId = createThesis.json.id;
    console.log(' thesis id', thesisId);

    console.log('4) assign evaluator');
    const assign = await request(`/theses/${thesisId}/assign-evaluators`, { method: 'POST', body: { evaluator_ids: [evaluatorId], is_blind: false }, headers: { Authorization: `Bearer ${token}` } });
    if (assign.status !== 200) throw new Error('assign failed ' + assign.status + ' ' + assign.body);
    console.log(' assigned evaluator');

    console.log('5) try to remove evaluator (should work since no evaluation started)');
    const remove = await request(`/theses/${thesisId}/evaluators/${evaluatorId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (remove.status !== 200) throw new Error('remove evaluator failed ' + remove.status + ' ' + remove.body);
    console.log(' removed evaluator OK');

    console.log('6) verify thesis timeline has event evaluation_submitted?');
    const thesis = await request(`/theses/${thesisId}`, { headers: { Authorization: `Bearer ${token}` } });
    console.log(' thesis timeline length', thesis.json.timeline?.length);
    console.log(' sample timeline event:', thesis.json.timeline?.[0]);

    console.log('DONE OK');
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
