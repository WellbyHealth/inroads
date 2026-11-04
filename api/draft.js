import { readDoc, orgDocs } from '../lib/store.mjs';
import { readBody, send, withUser } from '../lib/http.mjs';
import { CARE, careOf } from '../lib/care.mjs';

// Drafts outreach that reads like it came from someone who knows this relationship: it uses the
// contact's name and role, the last real touch or meeting (and its outcome), the source's actual
// referral pattern, the win-flow step it belongs to, the nearest office, and the sender's own voice.

const clip = (s, n = 600) => String(s ?? '').slice(0, n);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = k => (/^\d{4}-\d{2}/.test(k || '') ? MONTHS[+k.slice(5, 7) - 1] : '');
const daysAgo = d => d ? Math.round((Date.now() - Date.parse(d)) / 864e5) : null;
function when(d) {
  const n = daysAgo(d); if (n == null) return '';
  if (n <= 1) return n <= 0 ? 'today' : 'yesterday';
  if (n < 7) return 'earlier this week';
  if (n < 14) return 'last week';
  if (n < 28) return 'a couple of weeks ago';
  return `back in ${MONTHS[new Date(d).getUTCMonth()]}`;
}
const ahead = d => { const t = new Date(d); return t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' }); };
// NPI names arrive in capitals ("BAYLOR SCOTT & WHITE MEDICAL CENTER - PLANO"); make them readable.
const SMALL = new Set(['of', 'and', 'the', 'at', 'for', 'in', 'on', '&']);
function niceName(n) {
  n = String(n || '').trim();
  if (/[a-z]/.test(n)) return n;
  return n.toLowerCase().replace(/\b[\w']+/g, (w, i) => (i && SMALL.has(w)) ? w : /^(llc|lp|pc|pa|md|snf|ltc|ltach)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1));
}
const shortName = n => niceName(n).replace(/\s+(-|–|,).*$/, '').replace(/\b(LLC|Inc\.?|LP|PC|PA)\b\.?/g, '').trim();
const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`;

function intentOf(step, status, kind) {
  const l = String(step?.label || '').toLowerCase();
  if (/thank/.test(l)) return 'thanks';
  if (/lunch|in-service|learn/.test(l)) return 'lunch';
  if (step && step.kind === 'visit') return 'visit';
  if (/follow/.test(l)) return 'followup';
  if (/intro/.test(l)) return 'intro';
  if (kind !== 'email') return kind;
  return { Protect: 'winback', Grow: 'grow', Healthy: 'warm' }[status] || 'intro';
}

function needLine(type, careKey, care) {
  if (careKey !== 'home_care') return `patients who could use ${care.label.toLowerCase()} once they're home`;
  return {
    'Hospital': 'patients going home after discharge who need help with bathing, meals, medication reminders or someone there overnight',
    'Skilled nursing': 'residents heading home from your building who need a hand for the first few weeks',
    'Rehab hospital': 'patients finishing rehab who need support at home to stay safe and keep their progress',
    'Assisted living': 'residents who need more one-on-one time than your team can give',
    'Physician office': 'patients who are struggling to manage at home between visits',
  }[type] || 'people who need a little help to stay safe at home';
}

function templateDraft(c) {
  const { src, short, who, role, agency, senderFull, senderFirst, care, careKey, stats, intent, lastTouch, lastMtg, nextMtg, office, kind } = c;
  const hi = who ? `Hi ${who},` : 'Hello,';
  const need = needLine(src.type, careKey, care);
  // What has actually happened between us, most recent first.
  let history = '';
  if (lastMtg && daysAgo(lastMtg.end) < 75) history = `Thank you again for making time for ${lastMtg.title ? 'our ' + lastMtg.title.replace(/^./, m => m.toLowerCase()) : 'our visit'} ${when(lastMtg.end)}.`;
  else if (lastTouch && daysAgo(lastTouch.at) < 60) history = { visit: `It was good to stop by ${short} ${when(lastTouch.at)}.`, call: `Thanks for taking my call ${when(lastTouch.at)}.`, lunch: `Thank you for having us in ${when(lastTouch.at)}.`, email: `I wanted to follow up on my note from ${when(lastTouch.at)}.`, meeting: `Thank you for meeting with me ${when(lastTouch.at)}.` }[lastTouch.kind] || '';
  const lastRefMonth = monthName(stats.lastMonth);
  const intro = `I'm ${senderFirst || 'the community liaison'}${senderFirst ? ` with ${agency}` : ` at ${agency}`}${office ? `. Our ${office.label} office is about ${Math.max(1, Math.round(office.dist))} ${Math.round(office.dist) === 1 ? 'mile' : 'miles'} from you, so we're already caring for families in ${src.city || 'your area'}` : ''}.`;
  const lines = {
    intro: [intro, `We help ${need}. We can usually start within a day or two, and I'll send you a short update after the first visit so you know how they're doing.`],
    winback: [`You've trusted us with ${plural(stats.total12, 'referral')} over the past year, and we're grateful for every one.`, `It's been quieter from ${short} since ${lastRefMonth || 'the summer'}, so I wanted to ask you directly: is there anything we could be doing better, or has something changed on your side that we should know about?`],
    grow: [`Thank you for the ${plural(stats.last3, 'referral')} you've sent us over the last few months. It means a lot that you thought of us.`, `If it would help, I can make sending the next one even simpler: one direct number, and a same-day call back from me.`],
    warm: [`I just wanted to say thank you. ${short} has been one of our steadiest partners this year, with ${plural(stats.total12, 'referral')} so far.`, `If there's ever a case you're unsure about, call me first and I'll tell you honestly whether we're the right fit.`],
    thanks: [`Thank you for thinking of us for your patient${stats.last3 > 1 ? 's' : ''}${lastRefMonth ? ` in ${lastRefMonth}` : ''}. We'll keep you posted on how they're settling in at home.`, `I know a first referral is a leap of faith, and we don't take it lightly.`],
    visit: [history ? '' : intro, `I'll be near ${src.city || 'you'} next week and would love to drop off our referral sheet and put a face to the name. Is there a time that's usually quiet for your team?`],
    lunch: [`Could I bring lunch for your ${src.type === 'Hospital' ? 'case management and discharge team' : src.type === 'Physician office' ? 'office staff' : 'team'} one day in the next few weeks?`, `I'd keep it to 15 minutes: what we do, how to reach us after hours, and what usually makes the first week home go smoothly.`],
    followup: [`I know your days are full, so I'll keep this short.`, `Is there anything that came up since we last spoke where we could have helped? And is there anyone else on your team I should be introducing myself to?`],
  }[intent] || [intro];
  if (nextMtg) lines.push(`Looking forward to seeing you on ${ahead(nextMtg.start)}.`);
  const ask = { intro: 'Would you have 15 minutes in the next week or two for a quick call or a short visit?', winback: "Would a quick call this week work? I'm also happy to come by whenever suits you.", followup: "Would a 10-minute call this week work?" }[intent] || '';
  const sign = [senderFull || '[Your name]', agency].filter(Boolean).join('\n');
  if (kind === 'call' || kind === 'visit') {
    const goal = { intro: `introduce yourself and find out who handles ${care.label.toLowerCase()} referrals`, winback: `find out why referrals slowed after ${lastRefMonth || 'recently'} and what would bring them back`, grow: 'thank them and make the next referral easier', warm: 'say thank you and keep the relationship warm', thanks: 'thank them for the first referral and share how the patient is doing', lunch: 'book a lunch-and-learn date', visit: 'meet whoever plans discharges, put a face to the name and leave your direct line', call: 'learn how they choose an agency today and where you could help', followup: 'see what has changed since the last touch' }[intent] || 'build the relationship';
    const facts = [stats.total12 ? `${plural(stats.total12, 'referral')} in the last 12 months (${stats.last3} in the last 3, ${stats.prior3} the 3 before)` : 'No referrals yet', lastMtg ? `Last meeting: ${lastMtg.title}${lastMtg.outcome ? `. Outcome: ${lastMtg.outcome}` : ''}` : lastTouch ? `Last touch: ${lastTouch.kind} ${when(lastTouch.at)}${lastTouch.subject ? ` (${lastTouch.subject})` : ''}` : 'No outreach logged yet', office ? `${Math.round(office.dist)} mi from your ${office.label} office` : ''].filter(Boolean);
    return {
      subject: `${kind === 'call' ? 'Call' : 'Visit'} plan: ${short}`,
      body: `Goal: ${goal}.\n\nWho: ${who ? `${c.contactFull}${role ? `, ${role}` : ''}` : `Ask the front desk for whoever handles ${src.type === 'Hospital' ? 'discharge planning' : 'referrals'}`}\n${kind === 'visit' ? `Where: ${niceName(src.address)}${src.city ? ', ' + src.city : ''}\n` : ''}\nWhat you know:\n${facts.map(f => '- ' + f).join('\n')}\n\nOpener: "${who ? `Hi ${who}, it's ${senderFirst || '[your name]'} from ${agency}.` : `Hi, I'm ${senderFirst || '[your name]'} from ${agency}.`} ${history || (intent === 'winback' ? 'I wanted to check in personally.' : 'Do you have two minutes?')}"\n\nAsk:\n- ${intent === 'winback' ? 'Has anything changed in how you choose a home care agency?' : `What do families usually need most in the first week home?`}\n- Is there a case right now where you're unsure what to do?\n- What's the easiest way for you to send us a referral?\n\n${kind === 'visit' ? 'Bring: referral sheet with your direct line, a few service flyers, something small for the team.\n\n' : ''}After: log who you spoke with and set the next touch.`,
    };
  }
  const subject = { intro: `${care.label} for ${short} patients going home`, winback: who ? `Checking in, ${who}` : `Checking in from ${agency}`, grow: who ? `Thank you, ${who}` : `Thank you from ${agency}`, warm: 'A quick thank-you', thanks: 'Thank you for the referral', visit: `Stopping by ${short}`, lunch: `Lunch for your team?`, followup: `Following up from ${agency}` }[intent];
  // Put the opener sentences in one paragraph, the rest in their own.
  const para = [history, lines[0]].filter(Boolean).join(' ');
  return { subject, body: [hi, para, ...lines.slice(1).filter(Boolean), ask, `Thank you,\n${sign}`].filter(Boolean).join('\n\n') };
}

// Wellby sales workspace: the reader is an agency owner or growth leader we are selling Wellby to.
// No referral language: they are a prospective customer, not a referral source.
const PITCH = 'Wellby shows a home care, home health or hospice team which hospitals, physician offices and facilities are sending them referrals, which ones are slipping, and who each liaison should visit next, then drafts the outreach for them.';
function salesIntent(step, kind) {
  const l = String(step?.label || '').toLowerCase();
  if (/demo/.test(l)) return 'demo';
  if (/trial invite/.test(l)) return 'trial';
  if (/check-in/.test(l)) return 'checkin';
  if (/close|plan/.test(l)) return 'close';
  if (/follow/.test(l)) return 'followup';
  return kind === 'email' ? 'intro' : kind;
}
function salesTemplate(c) {
  const { short, who, role, senderFull, senderFirst, intent, kind, lastTouch, src } = c;
  const hi = who ? `Hi ${who},` : 'Hello,';
  const sign = [senderFull || '[Your name]', 'Wellby'].join('\n');
  const multi = src.sites > 1 ? ` across your ${src.sites} locations` : '';
  if (kind !== 'email') {
    const goal = { demo: 'run a 20-minute demo on their own market', checkin: 'see how the trial is going and clear any blockers', close: 'agree on a plan and a start date', followup: 'get a reply to the intro email and book a demo' }[intent] || 'find out how they grow referrals today and book a demo';
    return { subject: `${kind === 'visit' ? 'Demo plan' : 'Call plan'}: ${short}`, body: `Goal: ${goal}.\n\nWho: ${who ? `${c.contactFull}${role ? `, ${role}` : ''}` : 'Ask for the owner, administrator or director of business development'}\n\nOpen with: ${lastTouch ? `following up on my ${lastTouch.kind} ${when(lastTouch.at)}` : `I work with home care and hospice teams on referral growth`}.\n\nAsk:\n- How do your liaisons decide who to visit each week?\n- How do you see which referral sources are slowing down?\n- What do you use today (CRM, spreadsheets, nothing)?\n\nOffer: a 14-day free trial loaded with their own market: app.wellbyinroads.com/signup` };
  }
  const body = {
    intro: [`${PITCH.replace('Wellby shows a home care, home health or hospice team', `Wellby shows teams like ${short}`)}`, `It's built for agencies with liaisons in the field${multi}, and it works from public data on day one, so there's nothing to set up before you see value.`, 'Would you be open to a 20-minute look at your own market next week?'],
    followup: [`Following up on my note${lastTouch ? ' ' + when(lastTouch.at) : ''} about Wellby.`, `The short version: your liaisons get a ranked list of who to visit, and you see which referral sources are growing or slipping${multi}.`, 'Is a quick demo worth 20 minutes? Happy to work around your schedule.'],
    trial: ['Thanks for taking the time to see Wellby.', 'Here is your free 14-day trial: app.wellbyinroads.com/signup. Your market loads automatically, and I can add your team in a few minutes.', 'Want me to set up a short kickoff with your liaisons?'],
    checkin: ["Checking in on your Wellby trial.", 'Is your team using the daily plan, and is anything getting in the way? I can help load your referral history so the trends are yours, not just the public data.', 'Would a 15-minute call this week help?'],
    close: ['Your Wellby trial is wrapping up soon.', `Based on your team size${multi}, I'd suggest the ${src.sites >= 6 ? 'Enterprise' : src.sites >= 2 ? 'Team' : 'Solo'} plan. I can send the details or walk through them on a quick call.`, 'Which works better for you?'],
  }[intent] || [PITCH, 'Would you be open to a 20-minute demo?'];
  const subject = { intro: `Referral growth for ${short}`, followup: `Re: referral growth for ${short}`, trial: `Your Wellby trial`, checkin: `How's the Wellby trial going?`, close: `Next step with Wellby` }[intent] || `Wellby for ${short}`;
  return { subject, body: [hi, ...body, `Thank you,\n${sign}`].join('\n\n') };
}

export default withUser(async (req, res, me) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readBody(req);
  const D = orgDocs(me.org);
  const [settings, activity, contactsDoc, flows, meetings] = await Promise.all([
    readDoc(D.settings, {}), readDoc(D.activity, []), readDoc(D.contacts, {}), readDoc(D.flows, {}), readDoc(`orgs/${me.org}/meetings.json`, []),
  ]);
  const src = { name: clip(b.source?.name, 160), type: clip(b.source?.type, 60), taxonomy: clip(b.source?.taxonomy, 120), city: niceName(clip(b.source?.city, 60)), address: clip(b.source?.address, 160) };
  const sid = clip(b.sourceId, 80) || activity.find(a => a.sourceName === src.name)?.sourceId || '';
  const n = k => +b.stats?.[k] || 0;
  const stats = { status: clip(b.stats?.status, 20), last3: n('last3'), prior3: n('prior3'), last6: n('last6'), prior6: n('prior6'), total12: n('total12'), lastMonth: clip(b.stats?.lastMonth, 10), firstMonth: clip(b.stats?.firstMonth, 10), why: clip(b.stats?.why, 400) };
  const kind = ['email', 'call', 'visit'].includes(b.kind) ? b.kind : 'email';

  // The best contact: the most recently updated one with an email, else the first one we were sent.
  const list = (contactsDoc[sid] || []).slice().sort((x, y) => String(y.updated).localeCompare(String(x.updated)));
  const ct = list.find(x => x.email) || list[0] || (b.contact?.name ? b.contact : null);
  const contactFull = clip(ct?.name, 120), who = contactFull.split(' ')[0] || '', role = clip(ct?.role, 120).replace(/\s*\(edited\)\s*/i, '');

  const done = activity.filter(a => a.sourceId === sid && a.status === 'done' && !/^skip/i.test(a.subject || '')).sort((x, y) => String(y.doneAt || y.at).localeCompare(String(x.doneAt || x.at)));
  const fDone = (flows[sid]?.steps || []).filter(s => s.done).sort((x, y) => y.done.localeCompare(x.done))[0];
  const lastTouch = done[0] ? { kind: done[0].kind, at: done[0].doneAt || done[0].at, subject: clip(done[0].subject, 160) } : fDone ? { kind: fDone.kind, at: fDone.done + 'T15:00:00Z', subject: fDone.label } : null;
  const mine = meetings.filter(m => m.sourceId === sid && m.status !== 'canceled');
  const lastMtg = mine.filter(m => m.status === 'done').sort((x, y) => y.end.localeCompare(x.end))[0] || null;
  const nextMtg = mine.filter(m => m.status === 'scheduled' && Date.parse(m.start) > Date.now()).sort((x, y) => x.start.localeCompare(y.start))[0] || null;
  const f = flows[sid], step = f && Number.isInteger(b.flowStep) ? f.steps[b.flowStep] || null : null;
  const office = b.office?.label && +b.office.dist >= 0 ? { label: clip(b.office.label, 40), dist: +b.office.dist } : null;

  const careKey = careOf(settings.careType), care = CARE[careKey];
  const agency = settings.agencyName || me.orgName || 'our agency';
  const senderFull = clip(settings.senderName || me.name || '', 120);
  const senderFirst = senderFull.split(/[ ,]/)[0] || '';
  const SALES = !!me.orgSales;
  if (SALES) Object.assign(src, { st: clip(b.source?.st, 4), sites: Math.max(1, +b.source?.sites || 1), website: clip(b.source?.website, 200), parent: clip(b.source?.parent, 120), notes: clip(b.source?.notes, 600) });
  const intent = SALES ? salesIntent(step, kind) : intentOf(step, stats.status, kind);
  const ctx = { src, short: shortName(src.name), who, role, contactFull, agency, senderFull, senderFirst, care, careKey, stats, intent, lastTouch, lastMtg, nextMtg, office, kind };

  const key = process.env.ANTHROPIC_API_KEY;
  const tmpl = () => SALES ? salesTemplate(ctx) : templateDraft(ctx);
  if (!key) return send(res, 200, { ...tmpl(), drafter: 'template' });

  // A few of the sender's own sent emails, so the draft sounds like them.
  const voice = activity.filter(a => a.by === me.email && a.kind === 'email' && a.status === 'done' && (a.body || '').length > 80).slice(-3).map(a => clip(a.body, 700));
  const salesSystem = `You write sales outreach from ${senderFull || 'a Wellby founder'} at Wellby to the owner, administrator or business development leader of a home care, home health or hospice agency. They are a prospective customer for Wellby software. They do not send referrals to Wellby, so never thank them for referrals or ask for referrals or patients.

What Wellby does: ${PITCH} Free 14-day trial at app.wellbyinroads.com/signup. Plans: Solo, Team (2 to 5 locations), Enterprise (6 or more).

Use only the facts provided: the contact's name and role, the agency's locations and notes, and any past touches or meetings. Fit the purpose of the step (intro, follow-up, demo, trial invite, trial check-in, close). For calls or demos, write a short plan: goal, who, opener, three questions, the offer.

Rules: under 110 words for emails. One clear, small ask. No hype, no exclamation marks, no invented facts, customers, numbers or results. Avoid stock phrases: "I hope this email finds you well", "reach out", "touch base", "circle back", "synergy", "I wanted to introduce". Reply as JSON: {\"subject\": \"...\", \"body\": \"...\"}.`;
  const system = `You write outreach for a ${care.org}'s community liaison to one specific referral source. The reader is a busy case manager, discharge planner, social worker, facility director or office manager who gets generic vendor emails every day and ignores them. Your job is to sound like a real local person who knows this relationship.

Make it personal using only the facts provided:
- Address the contact by first name when known, and write for their role.
- If there was a recent meeting or touch, open with it in plain words (for example "Thanks again for having us for the lunch-and-learn last week"). If the meeting outcome mentions something they asked for, follow through on it.
- Use the real referral pattern: thank them for actual referrals, or, if referrals dropped, say so gently and ask what changed. Never guilt them.
- If there is a nearby office, mention it once, naturally.
- Fit the purpose of the win-flow step (intro, visit, lunch-and-learn, follow-up, thank-you).
- If an upcoming meeting is scheduled, mention it.
- If voice samples are provided, match the sender's tone, sentence length and sign-off.

Rules: under 120 words for emails. One clear, small ask. No hype, no exclamation marks, no invented facts, numbers, awards or patient stories, never mention a specific patient. Never claim services the agency profile doesn't list. Avoid stock phrases: "I hope this email finds you well", "reach out", "touch base", "valued partner", "circle back", "synergy", "I wanted to introduce". Sign off with the sender's name and agency. Return only JSON: {"subject": string, "body": string}. The subject should be short and specific to them, not a marketing headline. For kind "call" or "visit", the subject is a short plan title and the body is a brief plan: goal, who to ask for, what you know, an opener in quotes, 2-3 questions, and the next step.`;
  const user = SALES ? JSON.stringify({
    kind, purpose: step ? `Sales step: ${step.label}` : `Sales outreach (${intent})`,
    sender: { name: senderFull || '[Your name]', company: 'Wellby', voiceSamples: voice },
    prospect: { name: niceName(src.name), shortName: ctx.short, type: src.type, city: src.city, state: src.st, locations: src.sites, website: src.website || null, parentCompany: src.parent || null, researchNotes: src.notes || null },
    contact: ct ? { firstName: who, fullName: contactFull, role } : 'unknown, use "Hello,"',
    history: { recentTouches: done.slice(0, 4).map(a => ({ kind: a.kind, when: when(a.doneAt || a.at), note: clip(a.subject, 160) })), lastMeeting: lastMtg ? { title: lastMtg.title, when: when(lastMtg.end), outcome: clip(lastMtg.outcome || lastMtg.notes, 300) } : null, upcomingMeeting: nextMtg ? { title: nextMtg.title, when: ahead(nextMtg.start) } : null },
  }) : JSON.stringify({
    kind, purpose: step ? `Win-flow step: ${step.label}` : `Status-based outreach (${intent})`,
    agency: { name: agency, careType: care.label, services: settings.services || care.services, differentiators: settings.pitch || '' },
    sender: { name: senderFull || '[Your name]', voiceSamples: voice },
    referralSource: { name: niceName(src.name), shortName: ctx.short, type: src.type, city: src.city, nearestOffice: office ? `${office.label} office, ${office.dist.toFixed(1)} miles away` : null },
    contact: ct ? { firstName: who, fullName: contactFull, role, notes: clip(ct.notes, 300) } : 'unknown, use "Hello," and write to the team',
    relationship: { status: stats.status, referralsLast12Months: stats.total12, last3Months: stats.last3, prior3Months: stats.prior3, lastReferralMonth: monthName(stats.lastMonth), firstReferralMonth: monthName(stats.firstMonth), whyNow: stats.why },
    history: {
      recentTouches: done.slice(0, 4).map(a => ({ kind: a.kind, when: when(a.doneAt || a.at), note: clip(a.subject, 160) })),
      lastMeeting: lastMtg ? { title: lastMtg.title, when: when(lastMtg.end), outcome: clip(lastMtg.outcome || lastMtg.notes, 300) } : null,
      upcomingMeeting: nextMtg ? { title: nextMtg.title, when: ahead(nextMtg.start) } : null,
    },
  });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 800, system: SALES ? salesSystem : system, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    const text = (j.content || []).map(c => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : text);
    return send(res, 200, { subject: clip(out.subject, 300), body: clip(out.body, 6000), drafter: 'claude' });
  } catch (e) {
    console.error('draft failed', e?.message);
    return send(res, 200, { ...tmpl(), drafter: 'template', warning: 'AI drafting unavailable, used a personal template.' });
  }
});
