/* Demo-läge: efterliknar StreamBIM.API så att widgeten kan provas utanför StreamBIM (?mock=1).
 * Används aldrig när widgeten körs inifrån StreamBIM. */
(function () {
  'use strict';
  const PS = 'Platsdata', EK = 'Egenkontroll';
  const floors = [{ id: 1, name: 'Plan 1', height: 0 }, { id: 2, name: 'Plan 2', height: 3.6 }, { id: 3, name: 'Plan 3', height: 7.2 }];
  const rooms = [
    { guid: 'ROOM-301', name: '3011', long: 'Kontor', center: [4, 8.5, 2] },
    { guid: 'ROOM-302', name: '3012', long: 'Korridor', center: [12, 8.5, 6] }
  ];
  const objs = [];
  const mk = (i, name, part, ent, zone, floor, status, c) => objs.push({
    guid: 'OBJ-' + i, name, center: c,
    properties: {
      'Name': [name], 'GUID': ['OBJ-' + i],
      [PS + '~Entreprenor']: [ent], [PS + '~Zon']: [zone], [PS + '~Byggdel']: [part], [PS + '~Vaning']: [floor],
      ...(status ? { [EK + '~Status']: [status] } : {})
    }
  });
  let n = 1;
  for (let k = 0; k < 6; k++) mk(n++, 'Apparatdosa D' + (101 + k), '63.B Dosor', 'EL - Elbolaget AB', 'B', 'Plan 3', k < 2 ? 'Klar' : (k < 5 ? 'Pågår' : ''), [2 + k * 2.5, 8.5, 2 + (k % 2) * 4]);
  for (let k = 0; k < 4; k++) mk(n++, 'Kabelstege KS-' + (31 + k), '63.C Kabelstegar', 'EL - Elbolaget AB', 'B', 'Plan 3', k === 0 ? 'Klar' : 'Ej påbörjad', [3 + k * 4, 9, 4]);
  for (let k = 0; k < 3; k++) mk(n++, 'Apparatdosa D2' + (10 + k), '63.B Dosor', 'EL - Elbolaget AB', 'A', 'Plan 3', '', [20 + k, 2, 2]);
  for (let k = 0; k < 4; k++) mk(n++, 'Ventilationskanal VK-' + (k + 1), '57.B Kanaler', 'VE - Ventab AB', 'B', 'Plan 3', 'Klar', [5 + k * 3, 7, 6]);

  function match(o, q) {
    if (q.key) return String((o.properties[q.key] || [])[0]) === String(q.value);
    const groups = (q.filter && q.filter.rules) || [];
    if (!groups.length) return true;
    return groups.some(g => g.every(r => String((o.properties[r.psetName + '~' + r.propKey] || [])[0]) === String(r.propValue)));
  }
  const log = (...a) => console.log('[mock StreamBIM]', ...a);

  window.StreamBIMMock = {
    create(cb) {
      let active = [];
      return {
        getUserEmail: async () => 'anna.svensson@elbolaget.se',
        getProjectId: async () => '5364',
        getBuildingId: async () => '1000',
        getFloors: async () => floors,
        setShowExpandButton: async () => true,
        valuesForObjectProperty: async (p) => Array.from(new Set(objs.map(o => (o.properties[p] || [])[0]).filter(Boolean))),
        gotoFloor: async (id) => { log('gotoFloor', id); return true; },
        applyObjectSearch: async (q) => {
          active = objs.filter(o => match(o, q)).map(o => o.guid);
          log('applyObjectSearch', JSON.stringify(q), '→', active.length);
          setTimeout(() => cb.spacesChanged && cb.spacesChanged([rooms[1].guid]), 1500);
          return active;
        },
        getObjectInfoForSearch: async (q) => objs.filter(o => match(o, q)).slice(0, (q.page && q.page.limit) || 1000),
        getObjectInfo: async (g) => {
          const r = rooms.find(x => x.guid === g);
          if (r) return { guid: r.guid, name: r.name, center: r.center, properties: { Name: [r.name], LongName: [r.long] } };
          return objs.find(o => o.guid === g);
        },
        setSearchVisualizationMode: async (m) => { log('mode', m); return true; },
        zoomToSearchResult: async () => true,
        resetObjectSearch: async () => { active = []; return true; },
        colorCodeObjects: async (m) => { log('colorCodeObjects', m); return true; },
        colorCodeObjectsWithLegends: async (x) => { log('colorCodeObjectsWithLegends', x.legends); return true; },
        highlightObject: async (g) => { log('highlight', g); return true; },
        deHighlightAllObjects: async () => true,
        gotoObject: async (g) => { log('gotoObject', g); return true; }
      };
    }
  };
})();
