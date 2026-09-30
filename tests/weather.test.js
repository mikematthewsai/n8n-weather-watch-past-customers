// Checks for workflow/weather-watch-past-customers.json.
// Runs the Code node source straight out of the workflow file, with n8n's globals stubbed and the clock
// frozen. Storm report lines are copied from real NOAA Storm Prediction Center files.
//   cd tests && npm install && node weather.test.js
const path = require('path');
const { DateTime, Settings } = require('luxon');
const WF = process.env.WF1 || path.join(__dirname, '..', 'workflow', 'weather-watch-past-customers.json');
const wf = require(WF);
const src = name => wf.nodes.find(x => x.name === name).parameters.jsCode;

function run(name, { nodes = {}, state, input = [] }) {
  const $ = n => ({
    isExecuted: n in nodes,
    first: () => { if (!(n in nodes)) throw new Error('unexecuted ' + n); return nodes[n][0]; },
    all: () => nodes[n] || [],
    item: (nodes[n] || [])[0],
  });
  const $input = { all: () => input, first: () => input[0] };
  const $json = (input[0] && input[0].json) || {};
  const fn = new Function('$', '$json', '$input', 'DateTime', '$getWorkflowStaticData', '"use strict";\n' + src(name));
  return fn($, $json, $input, DateTime, () => state);
}
const freeze = (iso, zone = 'America/New_York') => { const ms = DateTime.fromISO(iso, { zone }).toMillis(); Settings.now = () => ms; };
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra, null, 1).slice(0, 1500) : ''); } };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = x => ({ json: x });

const SETTINGS = {
  business_name: 'Test Roofing', business_number: '+15551230100', owner_cell: '+15551230199', timezone: 'America/Chicago',
  contact_email: 'owner@test.example', radius_miles: 3, watch_hail: true, hail_min_inches: 1, watch_wind: true, wind_min_mph: 58,
  wind_damage_reports: true, quiet_start: '21:00', quiet_end: '07:00', max_names: 8, lookups_per_run: 25,
  outreach_url: '', outreach_key: '', hail_message: '', wind_message: '', warning_message: '', replay_spc_day: '',
};
// Customers near Lorena, TX (a real 1.50 in report on 2025-05-19 at 1453Z, 31.39, -97.21).
const LIST = [
  '# name | phone | email | address | ok to text',
  'Ann Near | 555-123-0001 | ann@test.example | 101 Center St, Lorena, TX 76655 | yes',
  'Bob Far | +1 (555) 123-0002 | | 1 Main St, Dallas, TX 75201 | no',
  'Cy NoPhone |  | cy@test.example | 102 Center St, Lorena, TX 76655 | yes',
  'Bad Line | 5551230004',
  'Dee Given | 5551230005 | | Ranch road, Lorena TX | yes | ',
].join('\n');
const read = (settings = {}, list = LIST, state = {}) => run('Read your settings and customers', { nodes: { 'Your settings': [J({ ...SETTINGS, ...settings })], 'Your customers': [J({ customers: list })] }, state })[0].json;

// ---------- Read your settings and customers ----------
t('R1 example numbers refused', throws(() => read({ business_number: '+15555550100' }), /example phone numbers/));
t('R2 bad time zone refused', throws(() => read({ timezone: 'Mars/Base' }), /time zone/));
t('R3 bad replay day refused', throws(() => read({ replay_spc_day: '2025-05-19' }), /YYMMDD/));
t('R4 outreach url needs a key', throws(() => read({ outreach_url: 'https://x.example/webhook/outreach-request' }), /outreach_key/));
{
  const r = read();
  t('R5 four customers read, comment skipped, short line reported', r.customers.length === 4 && r.problems.some(p => /Line 5 needs/.test(p)), r);
  t('R6 phones normalized, blank phone kept blank', r.customers[0].phone === '+15551230001' && r.customers[1].phone === '+15551230002' && r.customers[2].phone === '', r.customers);
  t('R7 ok to text read, blank means no', r.customers[0].ok_to_text === true && r.customers[1].ok_to_text === false, r.customers);
  t('R8 every new address needs a lookup', r.need.length === 4);
  t('R9 default warnings list', r.cfg.warnings.length === 12 && r.cfg.warnings_lower.includes('hard freeze warning'));
  const st = { geo: { [r.customers[0].key]: { found: true }, [r.customers[1].key]: { found: false, tries: 1 } } };
  t('R10 located or already tried addresses are not looked up again', read({}, LIST, st).need.length === 2);
  t('R11 lookups capped per run', read({ lookups_per_run: 1 }).need.length === 1);
}
t('R12 rows from a sheet node work too', run('Read your settings and customers', { nodes: { 'Your settings': [J(SETTINGS)], 'Your customers': [J({ name: 'Row One', phone: '5551239999', address: '5 Elm St, Waco, TX', ok_to_text: 'yes', lat: 31.5, lon: -97.1 })] }, state: {} })[0].json.need[0].given.lat === 31.5);
t('R13 no customers refused', throws(() => read({}, '# only a comment'), /no customers/));

// ---------- Remember the locations ----------
{
  const r = read();
  const st = {};
  const asked = r.need.map(J);
  const census = [
    J({ result: { addressMatches: [{ coordinates: { x: -97.2105, y: 31.3912 }, addressComponents: { state: 'TX' } }] } }),
    J({ result: { addressMatches: [{ coordinates: { x: -96.797, y: 32.781 }, addressComponents: { state: 'TX' } }] } }),
    J({ result: { addressMatches: [] } }),
    J({ result: { addressMatches: [{ coordinates: { x: -97.2, y: 31.38 }, addressComponents: { state: 'TX' } }] } }),
  ];
  const zones = [
    J({ properties: { forecastZone: 'https://api.weather.gov/zones/forecast/TXZ158', county: 'https://api.weather.gov/zones/county/TXC309', relativeLocation: { properties: { city: 'Lorena', state: 'TX' } } } }),
    J({ properties: { forecastZone: 'https://api.weather.gov/zones/forecast/TXZ119', county: 'https://api.weather.gov/zones/county/TXC113' } }),
    J({ status: 404 }),
    J({ properties: { forecastZone: 'https://api.weather.gov/zones/forecast/TXZ158', county: 'https://api.weather.gov/zones/county/TXC309' } }),
  ];
  const out = run('Remember the locations', { nodes: { 'One item per address': asked, 'Look up the address': census }, input: zones, state: st })[0].json;
  t('L1 found three, one missing', out.found === 3 && out.missing.length === 1, out);
  t('L2 zone and county codes kept', st.geo[r.customers[0].key].zone === 'TXZ158' && st.geo[r.customers[0].key].county === 'TXC309' && st.geo[r.customers[0].key].state === 'TX');
  const st2 = {};
  const asText = [J({ data: JSON.stringify(zones[0].json) })];
  run('Remember the locations', { nodes: { 'One item per address': asked.slice(0, 1), 'Look up the address': census.slice(0, 1) }, input: asText, state: st2 });
  t('L2b zone read when the Weather Service answer arrives as text', st2.geo[r.customers[0].key].zone === 'TXZ158', st2);
  t('L3 not found is remembered as tried', st.geo[r.customers[2].key].found === false && st.geo[r.customers[2].key].tries === 1);
}

// ---------- Plan the checks ----------
const located = () => {
  const r = read();
  const geo = {};
  geo[r.customers[0].key] = { found: true, lat: 31.3912, lon: -97.2105, state: 'TX', zone: 'TXZ158', county: 'TXC309' };
  geo[r.customers[1].key] = { found: true, lat: 32.781, lon: -96.797, state: 'TX', zone: 'TXZ119', county: 'TXC113' };
  geo[r.customers[2].key] = { found: false, tries: 1 };
  geo[r.customers[3].key] = { found: true, lat: 31.38, lon: -97.2, state: 'TX', zone: 'TXZ158', county: 'TXC309' };
  return { r, geo };
};
{
  const { r, geo } = located();
  const p = run('Plan the checks', { nodes: { 'Read your settings and customers': [J(r)] }, state: { geo } }).map(x => x.json);
  t('P1 hail and wind for today and yesterday plus warnings for TX', p.length === 5 && p[4].url === 'https://api.weather.gov/alerts/active?status=actual&area=TX' && p[0].url.endsWith('/today_hail.csv') && p[3].url.endsWith('/yesterday_wind.csv'), p);
  const r2 = read({ replay_spc_day: '250519' });
  const p2 = run('Plan the checks', { nodes: { 'Read your settings and customers': [J(r2)] }, state: { geo } }).map(x => x.json);
  t('P2 replay reads that day and skips warnings', p2.length === 2 && p2[0].url.endsWith('/250519_rpts_hail.csv') && p2[1].url.endsWith('/250519_rpts_wind.csv'), p2);
  const r3 = read({ watch_hail: false, watch_wind: false, warnings: '' });
  t('P3 nothing to watch is refused', throws(() => run('Plan the checks', { nodes: { 'Read your settings and customers': [J(r3)] }, state: { geo } }), /nothing to watch/));
}

// ---------- Match to your customers ----------
const HAIL = 'Time,Size,Location,County,State,Lat,Lon,Comments\n' +
  '1328,100,Rich Hill,Bates,MO,38.1,-94.36,Emergency manager reported quarter hail in Rich Hill. (EAX)\n' +
  '1453,150,Lorena,McLennan,TX,31.39,-97.21,Social media picture of ping pong ball size hail in Lorena relayed via broadcast media. Time estimated from radar. (FWD)\n' +
  '0115,175,2 S Lorena,McLennan,TX,31.36,-97.21,Late report, golf ball size. (FWD)\n' +
  '1500,75,Lorena,McLennan,TX,31.39,-97.21,Penny size. (FWD)\n';
const WIND = 'Time,Speed,Location,County,State,Lat,Lon,Comments\n1812,61,1 S Clines Corners,Torrance,NM,35,-105.67,ASOS. (ABQ)\n1600,UNK,Lorena,McLennan,TX,31.40,-97.20,Trees down. (FWD)\n';
const EMPTY = { hail: 'Time,Size,Location,County,State,Lat,Lon,Comments\n', wind: 'Time,Speed,Location,County,State,Lat,Lon,Comments\n' };
function match({ now, settings = {}, state, hail = HAIL, wind = WIND, warn = { features: [] }, day = 'today' }) {
  freeze(now, 'America/Chicago');
  const r = read(settings);
  const plans = [{ kind: 'hail', day, url: 'h' }, { kind: 'wind', day, url: 'w' }];
  const input = [J({ data: hail }), J({ data: wind })];
  if (warn !== null && !settings.replay_spc_day) { plans.push({ kind: 'warning', day: 'now', url: 'n' }); input.push(J({ data: JSON.stringify(warn) })); }
  return run('Match to your customers', { nodes: { 'Read your settings and customers': [J(r)], 'Plan the checks': plans.map(J) }, input, state })[0].json;
}
{
  const { geo } = located();
  const st = { geo: JSON.parse(JSON.stringify(geo)) };
  // 2025-05-19 4:00 PM Chicago = 21:00Z, inside the storm day that started 2025-05-19 12Z.
  let m = match({ now: '2025-05-19T16:00', state: st });
  t('M1 first run says what it watches', m.send && /^Weather watch is on for Test Roofing\. 4 customers, 3 located\. Watching hail 1 in and up, wind 58 mph and up or wind damage, 12 kinds of weather warnings, within 3 mi\./.test(m.body), m.body);
  t('M2 largest hail near Ann is named with distance and local time', /Hail up to 1\.75 in reported within 3 mi of 2 past customers:/.test(m.body) && /- Ann Near \(555\) 123-0001, 2\.\d mi from 1\.75 in hail at 8:15 PM \(2 S Lorena, TX\)/.test(m.body), m.body);
  t('M3 far customer and small hail left out', !/Bob Far/.test(m.body) && !/0\.75/.test(m.body), m.body);
  t('M4 wind damage report counts, far wind report does not', /Damaging wind reported within 3 mi of 2 past customers:/.test(m.body) && /from a wind damage report/.test(m.body) && !/Clines/.test(m.body), m.body);
  t('M5 missing address named so it can be fixed', /could not find.*Cy NoPhone/i.test(m.body), m.body);
  t('M6 unusable line named once', /Line 5 needs name/.test(m.body));
  t('M7 text is queued as unsent until Twilio takes it', st.unsent.length === 1 && st.unsent[0].tries === 1);
  run('Mark it delivered', { state: st, input: [J({ sid: 'SM1' })] });
  t('M8 delivered clears it', st.unsent.length === 0);
  m = match({ now: '2025-05-19T16:30', state: st });
  t('M9 same storm day does not name them again', !m.send, m.body);
  const more = HAIL + '1700,200,Lorena,McLennan,TX,31.38,-97.20,Egg size. (FWD)\n';
  m = match({ now: '2025-05-19T17:00', state: st, hail: more });
  t('M10 bigger hail the same day still does not repeat the same people', !m.send, m.body);
  m = match({ now: '2025-05-20T16:00', state: st, hail: EMPTY.hail, wind: EMPTY.wind, day: 'today' });
  t('M11 quiet day sends nothing', !m.send);
}
{
  const { geo } = located();
  const st = { geo: JSON.parse(JSON.stringify(geo)), started: '2025-01-01' };
  const m = match({ now: '2025-05-19T22:30', state: st, wind: EMPTY.wind });
  t('Q1 quiet hours hold the text', !m.send && st.held.length === 1, st);
  const m2 = match({ now: '2025-05-20T07:05', state: st, hail: EMPTY.hail, wind: EMPTY.wind });
  t('Q2 the morning run sends what was held', m2.send && /Hail up to 1\.75/.test(m2.body) && st.held.length === 0, m2.body);
  const m3 = match({ now: '2025-05-20T07:35', state: st, hail: EMPTY.hail, wind: EMPTY.wind });
  t('Q3 refused text goes again next check', m3.send && m3.body === m2.body && st.unsent[0].tries === 2, st.unsent);
  for (let i = 0; i < 3; i++) match({ now: '2025-05-20T08:0' + i, state: st, hail: EMPTY.hail, wind: EMPTY.wind });
  const m4 = match({ now: '2025-05-20T09:00', state: st, hail: EMPTY.hail, wind: EMPTY.wind });
  t('Q4 given up after five tries', !m4.send && st.unsent.length === 0, st.unsent);
}
{
  const { geo } = located();
  const st = { geo, started: '2025-01-01' };
  const warn = { features: [
    { properties: { event: 'Hard Freeze Warning', status: 'Actual', messageType: 'Alert', areaDesc: 'McLennan; Hill', onset: '2025-01-20T18:00:00-06:00', ends: '2025-01-21T10:00:00-06:00', geocode: { UGC: ['TXZ158', 'TXZ142'] } } },
    { properties: { event: 'Wind Advisory', status: 'Actual', messageType: 'Alert', areaDesc: 'McLennan', ends: '2025-01-21T10:00:00-06:00', geocode: { UGC: ['TXZ158'] } } },
    { properties: { event: 'Flood Warning', status: 'Test', messageType: 'Alert', areaDesc: 'Dallas', ends: '2025-01-21T10:00:00-06:00', geocode: { UGC: ['TXC113'] } } },
  ] };
  const m = match({ now: '2025-01-20T12:00', state: st, hail: EMPTY.hail, wind: EMPTY.wind, warn });
  t('W1 warning matched by zone, names listed', m.send && /Hard Freeze Warning until Tue Jan 21, 10:00 AM covers 2 past customers \(McLennan; Hill\):\nAnn Near, Dee Given/.test(m.body), m.body);
  t('W2 events not on your list and test messages ignored', !/Wind Advisory/.test(m.body) && !/Flood/.test(m.body));
  st.unsent = [];
  const m2 = match({ now: '2025-01-20T13:00', state: st, hail: EMPTY.hail, wind: EMPTY.wind, warn });
  t('W3 same warning not repeated', !m2.send, m2.body);
  warn.features[0].properties.ends = '2025-01-20T11:00:00-06:00';
  const st2 = { geo, started: '2025-01-01' };
  t('W4 expired warning ignored', !/Hard Freeze/.test(match({ now: '2025-01-20T12:00', state: st2, hail: EMPTY.hail, wind: EMPTY.wind, warn }).body));
}
{
  const { geo } = located();
  const st = { geo, started: '2025-01-01' };
  const m = match({ now: '2025-05-19T16:00', state: st, settings: { outreach_url: 'https://x.example/webhook/outreach-request', outreach_key: 'k-1234567890123' } });
  t('H1 with outreach set, groups go as requests and not in your text', !/Hail up to/.test(m.body) && m.requests.length === 2, m);
  const h = m.requests[0];
  t('H2 request carries message, customers and consent', /^Hail near 2 past customers \(Mon May 19\)$/.test(h.title) && /Hail up to 1\.75 inch was reported near your home on Mon May 19\./.test(h.message) && /\{first_name\}/.test(h.message) && h.customers.find(c => c.name === 'Ann Near').ok_to_text === true, h);
  const items = run('One item per request', { nodes: { 'Match to your customers': [J(m)] }, state: st }).map(x => x.json);
  t('H3 key added to each request', items.length === 2 && items[0].body.key === 'k-1234567890123' && items[0].url === 'https://x.example/webhook/outreach-request');
  st.unsent = [];
  const chk = run('Check the handoff', { nodes: { 'One item per request': items.map(J) }, input: [J({ ok: true }), J({ message: 'Workflow was started' })], state: st })[0].json;
  t('H4 a handoff that is not ok falls back to texting you', chk.handed_off === 1 && chk.failed === 1 && st.unsent.length === 1 && /did not take this/.test(st.unsent[0].body), st.unsent);
  run('Mark it delivered', { state: st, input: [J({ sid: 'SM2' })] });
  t('H5 delivered does not clear a fallback that was never sent', st.unsent.length === 1);
}
{
  const { geo } = located();
  const st = { geo, started: '2025-01-01' };
  const a = match({ now: '2025-05-19T16:00', state: st, settings: { replay_spc_day: '250519' }, day: '250519', warn: null });
  const b = match({ now: '2025-05-19T16:05', state: st, settings: { replay_spc_day: '250519' }, day: '250519', warn: null });
  t('X1 replay reports every run', /Hail up to 1\.75/.test(a.body) && /Hail up to 1\.75/.test(b.body));
  const bad = match({ now: '2025-05-19T16:00', state: { geo, started: 'x', fail: { hail: 11 } }, hail: '<html>error</html>', wind: EMPTY.wind });
  t('X2 a source down for 12 checks is mentioned', /Could not read NOAA hail reports on the last 12 checks/.test(bad.body), bad.body);
}

// ---------- the file itself ----------
{
  const raw = JSON.stringify(wf);
  t('Z1 ships with no credentials', !wf.nodes.some(n => n.credentials));
  t('Z2 only example phone numbers in the file', !/\+1(?!555)\d{10}/.test(raw), raw.match(/\+1(?!555)\d{10}/));
  t('Z3 every node has a real name and the main note is yellow', !wf.nodes.some(n => /^(Code|HTTP Request|If|Set|Webhook)\d*$/.test(n.name)) && wf.nodes.find(n => n.name === 'Sticky Note').parameters.color === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
