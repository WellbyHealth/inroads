// Two additions around win flows:
// 1. Every draft request carries the full relationship context (source id, referral pattern,
//    nearest office, win-flow step), so the server can write a personal message, not a template.
// 2. A "Create a sample win flow" button that sets up a realistic, clearly labeled flow on a
//    real target, a few days in, so you can see how the steps, stages and drafts work.
const X = (window.WellbyExt = window.WellbyExt || {});
const W = () => window.Wellby;

const nativeFetch = window.fetch.bind(window);
window.fetch = (url, opts) => {
  try {
    if (url === '/api/draft' && opts?.body && W()?.S) {
      const b = JSON.parse(opts.body), { S, flowState } = W();
      const s = S.scored.find(x => x.p.name === b.source?.name && (!b.source.city || x.p.city === b.source.city));
      if (s) {
        b.sourceId = s.p.id;
        const first = s.h.findIndex(v => v > 0);
        Object.assign(b.stats ||= {}, { last3: s.last3, prior3: s.prior3, firstMonth: first >= 0 ? S.months[first] : '' });
        if (s.dist != null && s.office) b.office = { label: s.office, dist: s.dist };
        const fs = flowState(s.p.id);
        if (fs?.next && fs.next.kind === b.kind) b.flowStep = fs.next.i;
        opts = { ...opts, body: JSON.stringify(b) };
      }
    }
  } catch (e) { console.error(e); }
  return nativeFetch(url, opts);
};

// The same playbooks the app uses, so a sample flow looks exactly like a real one.
const PB = {
  Hospital: [['email', 'Intro email to case management', 0], ['visit', 'Drop-in visit with materials', 7], ['visit', 'Lunch-and-learn for the discharge team', 21], ['call', 'Follow-up call', 35], ['email', 'Thank-you after the first referral', null]],
  Post: [['email', 'Intro email to the social worker or director', 0], ['visit', 'Visit and meet the team', 7], ['visit', 'Offer an in-service for staff', 21], ['call', 'Follow-up call', 35], ['email', 'Thank-you after the first referral', null]],
};
const isHosp = t => /hospital/i.test(t) && !/rehab/i.test(t);
const isPost = t => /skilled|rehab|assisted|nursing/i.test(t);

function pickTarget() {
  const { S } = W();
  const free = S.scored.filter(s => !S.flows[s.p.id] && (isHosp(s.p.type) || isPost(s.p.type)));
  const score = s => (s.status === 'Open' ? 30 : s.status === 'Grow' ? 20 : 0) + (isHosp(s.p.type) ? 10 : 0) + (s.priority || 0) - (s.dist || 0) * 0.3;
  return free.sort((a, b) => score(b) - score(a))[0];
}

async function createSample() {
  const { S, post, addDays, today, toast, refreshView, openSource } = W();
  const s = pickTarget();
  if (!s) return toast('No open targets left to use for a sample. Add referral sources first.');
  const start = addDays(today(), -9);
  const steps = (isHosp(s.p.type) ? PB.Hospital : PB.Post).map(([kind, label, offset], i) => ({ kind, label, offset, done: i === 0 ? start : null }));
  const p = s.p;
  const r = await post('saveFlow', { sourceId: p.id, flow: { startedAt: start, sample: true, steps, p: { name: p.name, type: p.type, tx: p.tx, city: p.city, address: p.address, zip: p.zip, phone: p.phone, lat: p.lat, lng: p.lng, size: p.size, beds: p.beds } } });
  S.flows = r.flows;
  location.hash = '#flows'; refreshView(); openSource(p.id);
  toast(`Sample win flow started for ${p.name}. Drafting the next step…`);
  // Step 1 (the intro email) is marked done 9 days ago, so the visit is now due: draft it.
  setTimeout(() => { const btn = document.querySelector(`#drawer [data-stepact="draft"][data-sid="${CSS.escape(p.id)}"]`); if (btn) btn.click(); }, 150);
}

async function removeSample(id) {
  const { S, post, toast, refreshView, closeDrawer } = W();
  const r = await post('saveFlow', { sourceId: id, flow: null }); S.flows = r.flows;
  const drafts = S.activity.filter(a => a.sourceId === id && a.status === 'draft');
  for (const a of drafts) { const u = await post('updateActivity', { activity: { id: a.id, status: 'skipped' } }); S.activity = u.activity; }
  closeDrawer?.(); refreshView(); toast('Sample win flow removed');
}

const prevAfter = X._after;
X._after = (view, sub) => {
  if (prevAfter) prevAfter(view, sub);
  if (view !== 'flows') return;
  const { S } = W(), app = document.getElementById('app');
  const head = app.querySelector(':scope > .head');
  const hasSample = Object.values(S.flows).some(f => f.sample);
  if (head && !hasSample && !head.querySelector('#fSample')) {
    const btn = document.createElement('button'); btn.className = 'btn primary'; btn.id = 'fSample'; btn.textContent = 'Create a sample win flow';
    btn.onclick = async () => { btn.disabled = true; btn.textContent = 'Setting it up…'; try { await createSample(); } catch (e) { W().toast(e.message); btn.disabled = false; btn.textContent = 'Create a sample win flow'; } };
    const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.gap = '8px';
    const find = head.querySelector('a.btn'); if (find) { find.replaceWith(wrap); wrap.append(btn, find); } else head.append(btn);
  }
  const empty = app.querySelector('.card.empty');
  if (empty && !hasSample && !empty.querySelector('.fsHint')) empty.insertAdjacentHTML('beforeend', '<div class="small fsHint" style="margin-top:10px">Or tap <b>Create a sample win flow</b> to see one in action on a real target.</div>');
  for (const [id, f] of Object.entries(S.flows)) if (f.sample) { const c = app.querySelector(`.bcard[data-src="${CSS.escape(id)}"] .name`); if (c && !c.querySelector('.chip')) c.insertAdjacentHTML('beforeend', ' <span class="chip" style="font-size:11px;vertical-align:1px">Sample</span>'); }
};

const prevDrawer = X._drawer;
X._drawer = (id, d) => {
  if (prevDrawer) prevDrawer(id, d);
  const f = W().S.flows[id];
  const box = d.querySelector('.flowbox');
  if (!f?.sample || !box || box.querySelector('#fsNote')) return;
  box.insertAdjacentHTML('afterbegin', `<div id="fsNote" class="notice small" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;justify-content:space-between"><span><b>Sample flow.</b> The intro email is marked done 9 days ago so you can see a step come due. Nothing is sent until you approve it.</span><button class="btn sm ghost" id="fsRemove">Remove sample</button></div>`);
  box.querySelector('#fsRemove').onclick = () => removeSample(id).catch(e => W().toast(e.message));
};
