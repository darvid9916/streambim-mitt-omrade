/* Mitt område – StreamBIM-widget
 * Flöde: getUserEmail → rolltabell → planering → applyObjectSearch (entreprenör + zon)
 *        → setSearchVisualizationMode('FADED') → zoomToSearchResult → statusfärger.
 */
(function () {
  'use strict';

  const T = {
    sv: {
      title: 'Mitt område', connecting: 'Ansluter till StreamBIM…', contractor: 'Entreprenör', floor: 'Våning',
      zone: 'Zon', onlyMine: 'Bara mina', showStatus: 'Visa status', reset: 'Återställ',
      follow: 'Följ med när jag går in i ett rum', copyGuid: 'Kopiera GUID', close: 'Stäng',
      all: '(alla)', choose: '(välj)', unknownUser: 'Okänd användare – välj entreprenör manuellt',
      objects: n => `${n} objekt`, done: 'Klar', todo: 'Kvar', missing: 'Ingen status',
      todayPlan: (p) => `Planerat i dag: ${p.floor}, zon ${p.zone}${p.note ? ' – ' + p.note : ''}`,
      noPlan: 'Ingen planering i dag – välj våning och zon.',
      inRoom: r => `Du står i: ${r}`, copied: 'GUID kopierat', none: 'Inga objekt hittades. Kontrollera att egenskaperna finns i modellen.',
      connectFail: 'Kunde inte ansluta. Widgeten måste öppnas inifrån StreamBIM (eller med ?mock=1 för demo).',
      issueFor: n => `Ärende för: ${n}`, statusCount: (d, t, m) => `${d} klara · ${t} kvar · ${m} utan status`
    },
    en: {
      title: 'My area', connecting: 'Connecting to StreamBIM…', contractor: 'Contractor', floor: 'Floor',
      zone: 'Zone', onlyMine: 'Only mine', showStatus: 'Show status', reset: 'Reset',
      follow: 'Follow me when I enter a room', copyGuid: 'Copy GUID', close: 'Close',
      all: '(all)', choose: '(choose)', unknownUser: 'Unknown user – choose contractor manually',
      objects: n => `${n} objects`, done: 'Done', todo: 'Remaining', missing: 'No status',
      todayPlan: (p) => `Planned today: ${p.floor}, zone ${p.zone}${p.note ? ' – ' + p.note : ''}`,
      noPlan: 'No plan for today – choose floor and zone.',
      inRoom: r => `You are in: ${r}`, copied: 'GUID copied', none: 'No objects found. Check that the properties exist in the model.',
      connectFail: 'Could not connect. The widget must be opened from inside StreamBIM (or with ?mock=1 for demo).',
      issueFor: n => `Issue for: ${n}`, statusCount: (d, t, m) => `${d} done · ${t} remaining · ${m} without status`
    }
  };

  const $ = id => document.getElementById(id);
  const S = {
    settings: null, roles: null, plan: null, api: null, lang: 'sv',
    email: '', role: null, buildingId: null, floors: [], objects: [], statusOn: false,
    selected: null, currentFloorId: null
  };
  const t = (k, ...a) => { const v = (T[S.lang] || T.sv)[k]; return typeof v === 'function' ? v(...a) : v; };

  // ---------- helpers ----------
  async function loadJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw { code: 'CONFIG_LOAD_FAILED', detail: url + ' ' + r.status };
    return r.json();
  }
  function showError(e) {
    const el = $('error');
    el.textContent = typeof e === 'string' ? e : ((e && (e.code || e.message)) || 'Fel') + (e && e.detail ? ' – ' + JSON.stringify(e.detail) : '');
    el.hidden = false;
    console.error(e);
  }
  function clearError() { $('error').hidden = true; }
  function first(v) { return Array.isArray(v) ? v[0] : v; }

  // valuesForObjectProperty: formatet är odokumenterat. Tål lista, {values:[...]}, {värde: antal} m.m.
  function toValueList(res) {
    if (Array.isArray(res)) return res.map(v => (v && typeof v === 'object') ? (v.value ?? v.name ?? v.key ?? v.propValue ?? JSON.stringify(v)) : v);
    if (res && typeof res === 'object') {
      for (const k of ['values', 'data', 'result', 'results', 'items']) if (Array.isArray(res[k])) return toValueList(res[k]);
      const vals = Object.values(res);
      if (vals.length && vals.every(v => typeof v === 'string')) return vals;
      return Object.keys(res);
    }
    if (typeof res === 'string') return res ? [res] : [];
    return [];
  }
  function toObjectList(res) {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      for (const k of ['objects', 'values', 'data', 'result', 'results', 'items']) if (Array.isArray(res[k])) return res[k];
      return Object.values(res).filter(x => x && typeof x === 'object');
    }
    return [];
  }
  // Felsökning: sätt "debug": true i config/settings.json för att se StreamBIMs råa svar i panelen
  function debug(label, data) {
    if (!S.settings || !S.settings.debug) return;
    let pre = document.getElementById('debug');
    if (!pre) {
      pre = document.createElement('pre'); pre.id = 'debug';
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;font-size:11px;background:#111;color:#9fe;padding:8px;border-radius:6px;user-select:text;';
      document.getElementById('app').appendChild(pre);
    }
    let txt; try { txt = JSON.stringify(data); } catch (_) { txt = String(data); }
    pre.textContent += `${label} (${Array.isArray(data) ? 'array' : typeof data}): ${String(txt).slice(0, 1500)}\n\n`;
    console.info('[debug]', label, data);
  }

  // Robust egenskapsläsning: ObjectInfo-formatet är inte fullt dokumenterat.
  function getProp(info, pset, key) {
    if (!info || !key) return undefined;
    const p = info.properties || {};
    const cands = pset ? [pset + '~' + key, pset + '.' + key] : [];
    cands.push(key);
    for (const c of cands) if (p[c] !== undefined) return first(p[c]);
    if (pset && p[pset] && typeof p[pset] === 'object' && p[pset][key] !== undefined) return first(p[pset][key]);
    const suffix = Object.keys(p).find(k => k.endsWith('~' + key));
    return suffix ? first(p[suffix]) : undefined;
  }
  const guidOf = i => i.guid || i.id || i.globalId || getProp(i, '', 'GUID') || getProp(i, '', 'GlobalId');
  const nameOf = i => i.name || getProp(i, '', 'Name') || guidOf(i);
  const lastSeg = v => (typeof v === 'string' && v.includes('~')) ? v.split('~').pop() : v;

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function lookupRole(email) {
    const e = (email || '').toLowerCase().trim();
    const users = (S.roles && S.roles.users) || [];
    return users.find(u => u.match.toLowerCase() === e) ||
           users.find(u => u.match.startsWith('@') && e.endsWith(u.match.toLowerCase())) || null;
  }

  function todaysPlan(contractorValue) {
    const d = today();
    return ((S.plan && S.plan.entries) || []).find(p =>
      p.contractorValue === contractorValue && p.from <= d && d <= p.to) || null;
  }

  function translateUI() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  }

  function fillSelect(sel, values, placeholder, selected) {
    sel.innerHTML = '';
    const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; sel.appendChild(o);
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = typeof v === 'object' ? v.value : v;
      opt.textContent = typeof v === 'object' ? v.label : v;
      sel.appendChild(opt);
    });
    if (selected !== undefined && selected !== null) sel.value = selected;
  }

  // ---------- sökning ----------
  function rule(key, value) {
    return {
      buildingId: S.buildingId, psetName: S.settings.properties.pset, propKey: key,
      propValue: value, operator: S.settings.search.equalsOperator
    };
  }
  function buildQuery() {
    const P = S.settings.properties;
    const group = [];
    const c = $('contractorSel').value, z = $('zoneSel').value, f = $('floorSel');
    if (c) group.push(rule(P.contractor, c));
    if (z) group.push(rule(P.zone, z));
    if (P.floor && f.value) {
      const fl = S.floors.find(x => String(x.id) === f.value);
      if (fl) group.push(rule(P.floor, fl.name));
    }
    // Antagande: regler i samma inre array = OCH. Verifiera i testprojektet.
    return { filter: { rules: [group] }, page: { limit: S.settings.search.maxObjects, skip: 0 } };
  }

  async function runMine() {
    clearError();
    if (!$('contractorSel').value) { showError(t('unknownUser')); return; }
    const api = S.api, q = buildQuery();
    $('mineBtn').disabled = true;
    try {
      const floorId = $('floorSel').value;
      if (floorId) { S.currentFloorId = floorId; await api.gotoFloor(isNaN(+floorId) ? floorId : +floorId); }
      await api.applyObjectSearch(q, true);
      await api.setSearchVisualizationMode('FADED');
      await api.zoomToSearchResult();
      const infos = await api.getObjectInfoForSearch(q);
      debug('getObjectInfoForSearch (första objektet)', Array.isArray(infos) ? infos[0] : infos);
      debug('sökfråga', q);
      S.objects = toObjectList(infos).map(i => ({
        guid: guidOf(i), name: nameOf(i), center: i.center,
        part: getProp(i, S.settings.properties.pset, S.settings.properties.buildingPart) || '',
        room: S.settings.properties.room ? getProp(i, S.settings.properties.pset, S.settings.properties.room) : null,
        status: classify(getProp(i, S.settings.status.pset, S.settings.status.key)),
        dist: null, inRoom: null
      })).filter(o => o.guid);
      S.objects.sort((a, b) => String(a.part).localeCompare(b.part) || String(a.name).localeCompare(b.name));
      renderList();
      if (S.statusOn) await applyStatusColors();
    } catch (e) { showError(e); }
    finally { $('mineBtn').disabled = false; }
  }

  function classify(v) {
    v = lastSeg(v);
    if (v === undefined || v === null || String(v).trim() === '') return 'missing';
    const done = S.settings.status.doneValues.map(x => x.toLowerCase());
    return done.includes(String(v).trim().toLowerCase()) ? 'done' : 'todo';
  }

  async function applyStatusColors() {
    const C = S.settings.status.colors;
    const data = {};
    const n = { done: 0, todo: 0, missing: 0 };
    S.objects.forEach(o => { data[o.guid] = C[o.status]; n[o.status]++; });
    const legends = {};
    legends[`${t('done')} (${n.done})`] = C.done;
    legends[`${t('todo')} (${n.todo})`] = C.todo;
    if (n.missing) legends[`${t('missing')} (${n.missing})`] = C.missing;
    await S.api.colorCodeObjectsWithLegends({ data, legends });
    renderLegend(n);
  }

  function renderLegend(n) {
    const C = S.settings.status.colors, el = $('legend');
    el.innerHTML = '';
    if (!S.statusOn || !n) return;
    [['done', n.done], ['todo', n.todo], ['missing', n.missing]].forEach(([k, c]) => {
      const s = document.createElement('span');
      s.style.setProperty('--c', '#' + C[k]);
      s.textContent = `${t(k)} ${c}`;
      el.appendChild(s);
    });
  }

  function renderList() {
    $('resultCard').hidden = false;
    $('countTxt').textContent = t('objects', S.objects.length);
    const ul = $('list');
    ul.innerHTML = '';
    if (!S.objects.length) {
      const li = document.createElement('li'); li.textContent = t('none'); li.style.cursor = 'default'; ul.appendChild(li);
      return;
    }
    S.objects.forEach(o => {
      const li = document.createElement('li');
      li.className = (S.statusOn ? o.status : '') + (o.guid === S.selected ? ' sel' : '') + (o.inRoom === false ? ' dim' : '');
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = o.name;
      const mt = document.createElement('span'); mt.className = 'meta';
      mt.textContent = [o.part, o.dist !== null ? o.dist.toFixed(1) + ' m' : ''].filter(Boolean).join(' · ');
      li.append(nm, mt);
      li.addEventListener('click', () => selectObject(o.guid));
      ul.appendChild(li);
    });
  }

  async function selectObject(guid) {
    const o = S.objects.find(x => x.guid === guid);
    if (!o) return;
    S.selected = guid;
    renderList();
    try {
      await S.api.deHighlightAllObjects();
      await S.api.highlightObject(guid);
      await S.api.gotoObject(guid);
    } catch (e) { showError(e); }
    $('issueTitle').textContent = t('issueFor', o.name);
    $('issueHint').textContent = (S.settings.issueHint[S.lang] || S.settings.issueHint.sv);
    $('issueCard').hidden = false;
    $('issueCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function resetAll() {
    clearError();
    const api = S.api;
    S.objects = []; S.selected = null; S.statusOn = false;
    $('statusBtn').classList.remove('primary');
    $('resultCard').hidden = true; $('issueCard').hidden = true;
    try {
      await api.colorCodeObjects({});
      await api.resetObjectSearch();
      await api.setSearchVisualizationMode('ORIGINAL');
      await api.deHighlightAllObjects();
    } catch (e) { showError(e); }
  }

  // ---------- följ med ----------
  async function onSpacesChanged(guids) {
    if (!$('followChk').checked || !S.objects.length) return;
    if (!guids || !guids.length) { $('roomTxt').textContent = ''; S.objects.forEach(o => { o.inRoom = null; o.dist = null; }); renderList(); return; }
    try {
      const sp = await S.api.getObjectInfo(guids[0]);
      const roomName = getProp(sp, '', 'LongName') || getProp(sp, '', 'Long Name') || nameOf(sp);
      const roomNo = getProp(sp, '', 'Name') || sp.name;
      $('roomTxt').textContent = t('inRoom', [roomNo, roomName !== roomNo ? roomName : ''].filter(Boolean).join(' '));
      const c = sp.center;
      S.objects.forEach(o => {
        o.inRoom = S.settings.properties.room ? (o.room === roomNo || o.room === roomName) : null;
        o.dist = (c && o.center) ? Math.hypot(o.center[0] - c[0], o.center[1] - c[1], o.center[2] - c[2]) : null;
      });
      S.objects.sort((a, b) =>
        (b.inRoom === true) - (a.inRoom === true) ||
        ((a.dist ?? 1e9) - (b.dist ?? 1e9)));
      renderList();
    } catch (e) { showError(e); }
  }

  function onFloorChanged(floorId) {
    if (!$('followChk').checked || String(floorId) === String(S.currentFloorId)) return;
    S.currentFloorId = String(floorId);
    $('floorSel').value = String(floorId);
    if (S.objects.length && S.settings.properties.floor) runMine();
  }

  function onPicked(result) {
    if (result && S.objects.some(o => o.guid === result.guid)) selectObject(result.guid);
  }

  // ---------- uppstart ----------
  async function connect() {
    const params = new URLSearchParams(location.search);
    const mock = params.has('mock') || window.parent === window;
    const callbacks = { pickedObject: onPicked, spacesChanged: onSpacesChanged, floorChanged: onFloorChanged };
    if (mock) {
      $('mockBadge').hidden = false;
      window.StreamBIM.API = window.StreamBIMMock.create(callbacks);
      return window.StreamBIM.API;
    }
    const timeout = new Promise((_, rej) => setTimeout(() => rej(t('connectFail')), 15000));
    await Promise.race([window.StreamBIM.connectToParent(window.parent, callbacks), timeout]);
    return window.StreamBIM.API;
  }

  async function boot() {
    try {
      S.settings = await loadJson('config/settings.json');
      const base = S.settings.configBaseUrl || 'config/';
      [S.roles, S.plan] = await Promise.all([loadJson(base + 'roles.json'), loadJson(base + 'plan.json')]);
      S.lang = S.settings.defaultLanguage || 'sv';
      translateUI();

      S.api = await connect();
      const api = S.api;
      const [email, buildingId, floors] = await Promise.all([
        api.getUserEmail(), api.getBuildingId(), api.getFloors().catch(() => [])
      ]);
      debug('getUserEmail / getBuildingId', { email, buildingId });
      debug('getFloors', floors);
      S.email = email; S.buildingId = buildingId; S.floors = Array.isArray(floors) ? floors : [];
      S.role = lookupRole(email);
      if (S.role && S.role.language && T[S.role.language]) S.lang = S.role.language;
      translateUI();
      try { await api.setShowExpandButton(true); } catch (_) { /* valfritt */ }

      $('who').textContent = S.role
        ? `${email} · ${S.role.company} · ${S.role.discipline}`
        : `${email} · ${t('unknownUser')}`;

      const P = S.settings.properties;
      const [contractors, zones] = await Promise.all([
        api.valuesForObjectProperty(P.pset + '~' + P.contractor).then(r => { debug('valuesForObjectProperty ' + P.pset + '~' + P.contractor, r); return toValueList(r); }).catch(e => { debug('valuesForObjectProperty FEL', e); return []; }),
        api.valuesForObjectProperty(P.pset + '~' + P.zone).then(r => { debug('valuesForObjectProperty ' + P.pset + '~' + P.zone, r); return toValueList(r); }).catch(e => { debug('valuesForObjectProperty FEL', e); return []; })
      ]);
      const cList = Array.from(new Set(toValueList(contractors).map(lastSeg).concat(S.role && S.role.contractorValue ? [S.role.contractorValue] : []))).sort();
      const zList = Array.from(new Set(toValueList(zones).map(lastSeg))).sort();

      fillSelect($('contractorSel'), cList, t('choose'), S.role ? S.role.contractorValue : '');
      $('contractorSel').disabled = !!(S.role && S.role.contractorValue);
      fillSelect($('zoneSel'), zList, t('all'));
      fillSelect($('floorSel'), S.floors.map(f => ({ value: String(f.id), label: f.name })), t('all'));

      applyPlan();
      $('followChk').checked = S.settings.followSpaces !== false;
      $('areaCard').hidden = false;
    } catch (e) { showError(e); $('who').textContent = ''; }
  }

  function applyPlan() {
    const p = todaysPlan($('contractorSel').value);
    if (p) {
      const fl = S.floors.find(f => f.name === p.floor);
      if (fl) $('floorSel').value = String(fl.id);
      if ([...$('zoneSel').options].some(o => o.value === p.zone)) $('zoneSel').value = p.zone;
      $('planNote').textContent = t('todayPlan', p);
    } else {
      $('planNote').textContent = t('noPlan');
    }
  }

  // ---------- händelser ----------
  $('mineBtn').addEventListener('click', runMine);
  $('statusBtn').addEventListener('click', async () => {
    S.statusOn = !S.statusOn;
    $('statusBtn').classList.toggle('primary', S.statusOn);
    try {
      if (!S.objects.length) await runMine();
      if (S.statusOn) await applyStatusColors();
      else { await S.api.colorCodeObjects({}); renderLegend(null); }
      renderList();
    } catch (e) { showError(e); }
  });
  $('resetBtn').addEventListener('click', resetAll);
  $('contractorSel').addEventListener('change', applyPlan);
  $('closeIssueBtn').addEventListener('click', () => { $('issueCard').hidden = true; });
  $('copyGuidBtn').addEventListener('click', async () => {
    if (!S.selected) return;
    try { await navigator.clipboard.writeText(S.selected); $('copyGuidBtn').textContent = t('copied'); }
    catch (_) { window.prompt('GUID', S.selected); }
    setTimeout(() => { $('copyGuidBtn').textContent = t('copyGuid'); }, 1500);
  });

  boot();
})();
