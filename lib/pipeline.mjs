// Builds the Dallas County referral-source market from public data:
//  - NPPES NPI Registry API (providers, addresses, specialties)
//  - CMS Provider Data Catalog (hospital type & rating; nursing home beds, rating, location)
//  - U.S. Census batch geocoder (address -> lat/lng)

export const TERRITORY = {
  id: 'dallas-county-tx', label: 'Dallas County, TX', state: 'TX', county: 'DALLAS', center: [32.7767, -96.797],
  cities: ['DALLAS','IRVING','GARLAND','MESQUITE','RICHARDSON','GRAND PRAIRIE','CARROLLTON','DESOTO','DUNCANVILLE','LANCASTER','CEDAR HILL','ROWLETT','FARMERS BRANCH','ADDISON','UNIVERSITY PARK','HIGHLAND PARK','COPPELL','SACHSE','BALCH SPRINGS','SEAGOVILLE','GLENN HEIGHTS','HUTCHINS','WILMER','SUNNYVALE','COCKRELL HILL'],
};

// [NPPES taxonomy_description, Wellby type, enumeration_type]
export const TAXONOMIES = [
  ['General Acute Care Hospital', 'Hospital', 'NPI-2'],
  ['Rehabilitation Hospital', 'Rehab hospital', 'NPI-2'],
  ['Long Term Care Hospital', 'LTAC hospital', 'NPI-2'],
  ['Psychiatric Hospital', 'Psychiatric hospital', 'NPI-2'],
  ['Skilled Nursing Facility', 'Skilled nursing', 'NPI-2'],
  ['Nursing Facility/Intermediate Care Facility', 'Skilled nursing', 'NPI-2'],
  ['Assisted Living Facility', 'Assisted living', 'NPI-2'],
  ['Home Health', 'Home health agency', 'NPI-2'],
  ['Hospice Care, Community Based', 'Hospice', 'NPI-2'],
  ['Hospice, Inpatient', 'Hospice', 'NPI-2'],
  ['Case Management', 'Case management', 'NPI-2'],
  ['Clinic/Center', 'Clinic', 'NPI-2'],
  ['Geriatric Medicine', 'Physician: geriatrics', 'NPI-1'],
  ['Neurology', 'Physician: neurology', 'NPI-1'],
  ['Cardiovascular Disease', 'Physician: cardiology', 'NPI-1'],
  ['Physical Medicine & Rehabilitation', 'Physician: PM&R', 'NPI-1'],
  ['Internal Medicine', 'Physician: internal medicine', 'NPI-1'],
  ['Family Medicine', 'Physician: family medicine', 'NPI-1'],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'inroad-pilot/1.0' } }); if (r.ok) return await r.json(); } catch {}
    await sleep(700 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const UP = /\b(Llc|Lp|Pa|Pllc|Md|Do|Np|Rn|Ii|Iii|Iv|Usa|Ut|Utsw|Hca|Ne|Nw|Se|Sw|Llp|Pc|Facp|Facc|Phd|Mph|Aprn|Fnp|Dpm|Mba)\b/g;
export const titleCase = (s = '') => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(UP, m => m.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase());
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const streetKey = (addr, zip) => { const n = norm(addr).split(' '); return `${n[0]}|${n[1] || ''}|${String(zip).slice(0, 5)}`; };

export async function buildMarket(log = console.log) {
  const t0 = Date.now();
  // 1) NPPES
  const jobs = [];
  for (const [desc, type, enumType] of TAXONOMIES) for (const city of TERRITORY.cities) jobs.push({ desc, type, enumType, city });
  const recs = new Map();
  await pool(jobs, 6, async ({ desc, type, enumType, city }) => {
    for (let skip = 0; skip <= 1000; skip += 200) {
      const u = `https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=${encodeURIComponent(desc)}&city=${encodeURIComponent(city)}&state=TX&enumeration_type=${enumType}&limit=200&skip=${skip}`;
      const j = await getJSON(u);
      const res = j?.results || [];
      const want = desc.toLowerCase().split(/[,/]/)[0];
      for (const r of res) {
        const loc = (r.addresses || []).find(a => a.address_purpose === 'LOCATION');
        if (!loc || loc.state !== 'TX') continue;
        const tx = (r.taxonomies || []).find(t => t.primary) || r.taxonomies?.[0];
        if (!tx?.desc || !tx.desc.toLowerCase().includes(want)) continue;
        const b = r.basic || {};
        const isOrg = !!b.organization_name;
        const name = isOrg ? b.organization_name : [b.first_name, b.middle_name?.[0], b.last_name].filter(Boolean).join(' ') + (b.credential ? `, ${b.credential.replace(/\./g, '')}` : '');
        recs.set(r.number, {
          id: r.number, name: titleCase(name), type, tx: tx.desc, org: isOrg ? 1 : 0,
          address: titleCase([loc.address_1, loc.address_2].filter(Boolean).join(' ')), city: titleCase(loc.city), zip: (loc.postal_code || '').slice(0, 5),
          phone: loc.telephone_number || '', official: isOrg ? titleCase([b.authorized_official_first_name, b.authorized_official_last_name].filter(Boolean).join(' ')) : '',
          officialTitle: isOrg ? titleCase(b.authorized_official_title_or_position || '') : '',
        });
      }
      if (res.length < 200) break;
    }
  });
  log(`NPPES: ${recs.size} providers (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  // Hospital sub-units (departments, pharmacies, physician billing groups) are not referral campuses.
  const SUB = /\b(dept|department|pharmacy|laborator|lab|radiology|imaging|anesthesi|pathology|physicians|physician group|emergency medicine|billing|clinic|outpatient|infusion|dialysis|transplant|cancer center|surgery center)\b/i;
  let moved = 0;
  for (const r of recs.values()) if (['Hospital', 'Rehab hospital', 'LTAC hospital'].includes(r.type) && SUB.test(r.name)) { r.type = 'Clinic'; moved++; }
  log(`Reclassified ${moved} hospital sub-units as clinics`);

  // 2) CMS
  async function cms(ds) {
    const rows = [];
    for (let off = 0; off < 10000; off += 500) {
      const q = new URLSearchParams({ limit: 500, offset: off });
      q.set('conditions[0][property]', 'state'); q.set('conditions[0][value]', 'TX'); q.set('conditions[0][operator]', '=');
      const j = await getJSON(`https://data.cms.gov/provider-data/api/1/datastore/query/${ds}/0?${q}`);
      const r = j?.results || []; rows.push(...r);
      if (r.length < 500) break;
    }
    return rows.filter(r => /dallas/i.test(r.countyparish || ''));
  }
  const [hosp, nh] = await Promise.all([cms('xubh-q36u'), cms('4pq5-n9py')]);
  log(`CMS: ${hosp.length} hospitals, ${nh.length} nursing homes in Dallas County`);

  // 3) Merge duplicate org NPIs (same name + street + zip)
  const list = [];
  const seen = new Map();
  for (const r of recs.values()) {
    const k = r.org ? `${norm(r.name)}|${streetKey(r.address, r.zip)}` : null;
    if (k && seen.has(k)) { const p = seen.get(k); (p.alt ||= []).push(r.id); continue; }
    if (k) seen.set(k, r);
    list.push(r);
  }

  // Attach CMS facts by street+zip (and name overlap)
  const tok = s => new Set(norm(s).split(' ').filter(w => w.length > 2 && !['THE', 'AND', 'LLC', 'INC', 'CENTER', 'DALLAS', 'MEDICAL', 'HEALTH', 'HOSPITAL', 'NURSING', 'REHABILITATION', 'REHAB', 'CARE'].includes(w)));
  const overlap = (a, b) => { const A = tok(a), B = tok(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n; };
  const byStreet = new Map();
  for (const r of list) { const k = streetKey(r.address, r.zip); (byStreet.get(k) || byStreet.set(k, []).get(k)).push(r); }
  const attach = (row, name, addr, zip, types, facts) => {
    const cands = (byStreet.get(streetKey(addr, zip)) || []).filter(r => types.includes(r.type));
    let best = cands.sort((a, b) => overlap(b.name, name) - overlap(a.name, name))[0];
    if (!best) {
      best = { id: `ccn:${row.facility_id || row.cms_certification_number_ccn}`, name: titleCase(name), type: types[0], tx: types[0], org: 1, address: titleCase(addr), city: titleCase(row.citytown), zip: String(zip).slice(0, 5), phone: (row.telephone_number || '').replace(/\D/g, '') };
      list.push(best);
    }
    Object.assign(best, facts);
  };
  for (const h of hosp) {
    const type = /psychiatric/i.test(h.hospital_type) ? 'Psychiatric hospital' : 'Hospital';
    attach(h, h.facility_name, h.address, h.zip_code, [type, 'Rehab hospital', 'LTAC hospital', 'Hospital'], { cms: h.facility_id, cmsType: h.hospital_type, rating: +h.hospital_overall_rating || null, er: h.emergency_services === 'Yes' ? 1 : 0, cmsName: titleCase(h.facility_name) });
  }
  for (const n of nh) {
    const lat = +n.latitude, lng = +n.longitude;
    attach(n, n.provider_name, n.provider_address, n.zip_code, ['Skilled nursing'], { cms: n.cms_certification_number_ccn, beds: +n.number_of_certified_beds || null, rating: +n.overall_rating || null, cmsName: titleCase(n.provider_name), ...(lat && lng ? { lat: +lat.toFixed(5), lng: +lng.toFixed(5) } : {}) });
  }

  // 4) Geocode (Census batch), then ZIP-centroid fallback
  const addrKey = r => `${norm(r.address)}|${r.zip}`;
  const uniq = new Map();
  for (const r of list) if (!r.lat && !uniq.has(addrKey(r))) uniq.set(addrKey(r), r);
  const addrs = [...uniq.values()];
  const geo = {};
  const chunks = [];
  for (let i = 0; i < addrs.length; i += 2500) chunks.push(i);
  await pool(chunks, 3, async i => {
    const chunk = addrs.slice(i, i + 2500);
    const esc = s => '"' + String(s).replace(/"/g, '') + '"';
    const csv = chunk.map((r, j) => [i + j, esc(r.address.replace(/\b(Suite|Ste|Unit|Bldg|Building|Fl|Floor|Rm|Room)\b.*$/i, '').replace(/#.*$/, '').trim()), esc(r.city), 'TX', r.zip].join(',')).join('\n');
    for (let t = 0; t < 3; t++) {
      try {
        const fd = new FormData();
        fd.set('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv');
        fd.set('benchmark', 'Public_AR_Current');
        const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd });
        if (!r.ok) { await sleep(3000); continue; }
        const text = await r.text();
        for (const line of text.split('\n')) {
          const m = line.match(/^"?(\d+)"?,.*?,"?Match"?,"?(?:Exact|Non_Exact)"?,".*?","(-?[\d.]+),(-?[\d.]+)"/);
          if (m) geo[addrKey(addrs[+m[1]])] = [+(+m[3]).toFixed(5), +(+m[2]).toFixed(5)];
        }
        break;
      } catch { await sleep(3000); }
    }
  });
  const zipAcc = {};
  for (const r of list) {
    const g = r.lat ? [r.lat, r.lng] : geo[addrKey(r)];
    if (g) { r.lat = g[0]; r.lng = g[1]; r.geo = 'address'; const z = (zipAcc[r.zip] ||= [0, 0, 0]); z[0] += g[0]; z[1] += g[1]; z[2]++; }
  }
  let zipFallback = 0;
  for (const r of list) if (!r.lat && zipAcc[r.zip]) { const z = zipAcc[r.zip]; r.lat = +(z[0] / z[2]).toFixed(5); r.lng = +(z[1] / z[2]).toFixed(5); r.geo = 'zip'; zipFallback++; }
  const final = list.filter(r => r.lat);
  log(`Geocoded: ${final.length - zipFallback} by address, ${zipFallback} by ZIP, ${list.length - final.length} dropped`);

  // 5) Size signal: beds for nursing homes; co-located providers at the same address otherwise.
  const coloc = {};
  for (const r of recs.values()) { const k = streetKey(r.address, r.zip); coloc[k] = (coloc[k] || 0) + 1; }
  for (const r of final) {
    r.colocated = coloc[streetKey(r.address, r.zip)] || 1;
    let raw = r.beds || r.colocated;
    if (r.type === 'Hospital') raw = (r.cmsType && /acute/i.test(r.cmsType) ? 50 : 10) + (r.er ? 30 : 0) + Math.min(r.colocated, 200);
    r._raw = raw;
  }
  const byType = {};
  for (const r of final) (byType[r.type] ||= []).push(r);
  for (const arr of Object.values(byType)) {
    arr.sort((a, b) => a._raw - b._raw);
    arr.forEach((r, i) => { r.size = arr.length > 1 ? Math.round((i / (arr.length - 1)) * 100) : 50; delete r._raw; });
  }

  return {
    territory: TERRITORY, builtAt: new Date().toISOString(),
    sources: { nppes: 'NPPES NPI Registry API (npiregistry.cms.hhs.gov)', cms: 'CMS Provider Data Catalog: Hospital General Information (xubh-q36u), Nursing Home Provider Information (4pq5-n9py)', geocoder: 'U.S. Census Geocoder batch API' },
    counts: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
    providers: final,
  };
}
