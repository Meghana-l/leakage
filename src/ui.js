// ===== Leakage UI v2 =====
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K = v => v>=1000 ? '$'+(v/1000).toFixed(v>=100000?0:1)+'K' : v<10 ? '$'+Number(v).toFixed(2) : '$'+Math.round(v);
const usd2 = v => '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
let S=null, seed=2026, story='recovered', segK='failed', groupK=null, openId=null, showN=6;
const approvals=[], audit=[]; let apprSeq=1;
const tx = id => S.txById[id];
const CHEV = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function log(who, what){ audit.unshift({when:new Date(), who, what}); const el=$('#audit'); if(el) el.innerHTML = audit.slice(0,60).map(e=>`<tr><td class="tiny muted" style="white-space:nowrap">${e.when.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td><td class="small"><b>${esc(e.who)}</b> ${esc(e.what)}</td></tr>`).join(''); }
function what(t){ return {ride:'Robotaxi ride',charging:'Charging session',subscription:'Subscription renewal',service:'Service visit'}[t.product]; }
function city(t){ return MARKETS[t.market].city; }

// ---- friendly groupings ----
const FAIL_GROUPS = [
  {k:'funds', title:'Not enough money', codes:['51','61','BAL'], plan:'Wait for the rider\'s usual payday, try once, then offer another way to pay.'},
  {k:'bankno', title:'Bank said no', codes:['05'], plan:'Try the backup card in their wallet, or retry the next day.'},
  {k:'outage', title:'Bank was briefly down', codes:['91'], plan:'Retry within the hour. These usually go through.'},
  {k:'expired', title:'Card expired or not valid', codes:['54','14','TK'], plan:'Never retry the same card. Use a backup or ask the rider to update it.'},
  {k:'stolen', title:'Card reported lost or stolen', codes:['41','43'], plan:'Never retry. Flag for a fraud check and only accept a different method.'},
];
const MISMATCH_GROUPS = [
  {k:'duplicate', title:'Charged twice', plan:'Refund the rider and claim the money back from the provider.'},
  {k:'missing', title:'Money never arrived', plan:'Ask the provider to trace it. Charge again if it is truly lost.'},
  {k:'amount_mismatch', title:'Wrong amount arrived', plan:'Check for a fare change after the ride, then fix the record or bill the difference.'},
  {k:'fee_overcharge', title:'Provider took extra fees', plan:'Ask the provider for a credit back to the contracted rate.'},
  {k:'orphan', title:'Money with no matching charge', plan:'Usually a kiosk session that never synced. Create the missing record.'},
  {k:'fx_rounding', title:'Tiny currency rounding', plan:'Fixed automatically. Differences under 10 cents are written off.'},
];
const UNPAID_GROUPS = [
  {k:'person', title:'Needs a person', test:c=>c.owner==='human', plan:'Disputes, possible fraud, and very late partner invoices. A person decides the next step.'},
  {k:'riders', title:'Riders, agent is following up', test:c=>c.owner==='agent'&&c.kind==='consumer', plan:'A friendly in-app reminder with a pay link, then an email.'},
  {k:'partners', title:'Partner invoices, agent is following up', test:c=>c.owner==='agent'&&c.kind==='partner', plan:'Polite reminders to the partner\'s billing team until a payment date is confirmed.'},
];

function build(){
  S = runAll({count:+$('#vol').value, seed});
  S.txById = Object.fromEntries(S.data.txns.map(t=>[t.id,t]));
  S.txByRef = Object.fromEntries(S.data.txns.map(t=>[t.ref,t]));
  S.breakByRef = Object.fromEntries(S.recon.breaks.map(b=>[b.ref,b]));
  let failed=0, smart=0, naive=0, viol=0;
  for(const r of S.recovery){ const u=tx(r.txn).usd; failed+=u; if(r.recovered) smart+=u; if(r.naiveOk) naive+=u; viol+=r.naiveViolations; }
  const billed = S.data.txns.reduce((a,t)=>a+t.usd,0);
  const mis = S.recon.breaks.reduce((a,b)=>a+b.diffUsd,0);
  const misAuto = S.recon.breaks.filter(b=>b.autoResolve).reduce((a,b)=>a+b.diffUsd,0);
  const riders = S.collections.filter(c=>c.kind==='consumer'), partners = S.collections.filter(c=>c.kind==='partner');
  S.k = { billed, failed, smart, naive, viol, mis, misAuto, leaked: failed+mis, unpaidRiders: riders.reduce((a,c)=>a+c.usd,0), nRiders:riders.length,
    partnerUsd: partners.reduce((a,c)=>a+c.usd,0), nPartners: partners.length, nPerson:S.collections.filter(c=>c.owner==='human').length,
    nFailed:S.recovery.length, nBreaks:S.recon.breaks.length };
  approvals.length=0; audit.length=0;
  log('Recovery agent', `planned fixes for ${S.k.nFailed} failed payments and recovered ${K(smart)}.`);
  log('Reconciliation agent', `checked every settlement and found ${S.k.nBreaks} mismatches.`);
  log('Collections agent', `queued ${S.collections.length} unpaid accounts; ${S.k.nPerson} need a person.`);
  groupK=null; openId=null;
  renderHero(); renderStory(); renderFix(); renderWaiting(); renderEvals();
}

// ---- hero ----
function icon(kind){
  const p = { card:'<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M7 15h4"/>', clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', scale:'<path d="M12 4v16M6 20h12M5 8h14M7 8l-3 6a3 3 0 0 0 6 0zM17 8l-3 6a3 3 0 0 0 6 0z"/>' }[kind];
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
function renderHero(){
  const k=S.k; const back = k.smart + k.misAuto;
  $('#headline').innerHTML = `This week, <span class="amt-leak">${K(k.leaked)}</span> of payments leaked. Leakage got <span class="amt-ok">${K(back)}</span> back automatically.`;
  $('#subline').textContent = `Out of ${K(k.billed)} billed across ${S.data.txns.length.toLocaleString()} rides, charging sessions, and renewals. The rest is lined up for follow-up, with a person deciding anything risky.`;
  const rest = Math.max(0, k.leaked - back);
  const seg = [[back,'var(--green)','Got back automatically'],[rest,'var(--amber)','Being followed up'],[k.billed-k.leaked,'#DCE3F0','Paid normally']];
  // bar shows only the leaked part, so it is readable
  $('#flowbar').innerHTML = `<span style="width:${back/k.leaked*100}%;background:var(--green)"></span><span style="width:${rest/k.leaked*100}%;background:var(--amber)"></span>`;
  $('#flowlegend').innerHTML = `<span><span class="dot" style="background:var(--green)"></span><b>${K(back)}</b> got back automatically</span><span><span class="dot" style="background:var(--amber)"></span><b>${K(rest)}</b> being followed up</span><span>Bar shows only the ${K(k.leaked)} that leaked</span>`;
  const times = k.naive>0 ? (k.smart/k.naive).toFixed(1) : '–';
  $('#leaks').innerHTML = [
    {ico:'card', c:'var(--coral)', bg:'var(--coral-soft)', title:'Failed payments', num:K(k.failed), what:`${k.nFailed} payments declined after the ride or charge was already done.`, good:`${K(k.smart)} recovered, ${times}x more than plain retries`, go:'failed'},
    {ico:'clock', c:'var(--amber)', bg:'var(--amber-soft)', title:'Unpaid accounts', num:K(k.unpaidRiders), what:`${k.nRiders} riders still owe money after every recovery step. Separately, ${k.nPartners} partner invoices are overdue (${K(k.partnerUsd)}).`, good:`${k.nPerson} need a person, the rest are handled`, go:'unpaid'},
    {ico:'scale', c:'var(--blue)', bg:'var(--blue-soft)', title:'Money mismatches', num:K(k.mis), what:`${k.nBreaks} times what we charged and what arrived did not match.`, good:`Every one explained with a suggested fix`, go:'mismatch'},
  ].map(x=>`<div class="card leak"><div class="ico" style="color:${x.c};background:${x.bg}">${icon(x.ico)}</div><div class="small muted">${x.title}</div><div class="num">${x.num}</div><div class="what">${esc(x.what)}</div><div class="good">${esc(x.good)}</div><button data-go="${x.go}">Review</button></div>`).join('');
  $('#leaks').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ setSeg(b.dataset.go); location.hash='#fix'; });
}

// ---- story ----
const STORIES = [
  {k:'recovered', label:'A ride we got paid for'},
  {k:'collections', label:'A ride that stayed unpaid'},
  {k:'double', label:'A double charge'},
  {k:'stolen', label:'A stolen card'},
];
function findStory(k){
  const ride = r => tx(r.txn).product==='ride';
  if(k==='recovered') return S.recovery.find(r=>r.recovered && r.steps.length>=2 && ride(r)) || S.recovery.find(r=>r.recovered);
  if(k==='collections') return S.recovery.find(r=>!r.recovered && r.kind==='soft' && ride(r)) || S.recovery.find(r=>!r.recovered);
  if(k==='stolen') return S.recovery.find(r=>r.fraudFlag);
  if(k==='double'){ const b=S.recon.breaks.find(b=>b.type==='duplicate' && S.txByRef[b.ref]?.product==='ride') || S.recon.breaks.find(b=>b.type==='duplicate' && S.txByRef[b.ref]); return b?{brk:b}:null; }
}
function renderStory(){
  $('#storychips').innerHTML = STORIES.map(s=>`<button class="chip" aria-pressed="${s.k===story}" data-s="${s.k}">${s.label}</button>`).join('');
  $('#storychips').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ story=b.dataset.s; renderStory(); });
  const x = findStory(story); const st=[]; let note='';
  if(!x){ $('#storyline').innerHTML=''; $('#storynote').textContent='No example of this in the simulated week. Try a new week.'; return; }
  if(x.brk){
    const b=x.brk, t=S.txByRef[b.ref];
    st.push(['ok','1',endLabel(t),`${fmt(t.amount,t.cur)} in ${city(t)}`],['ok','2','Payment approved',RAILS[t.rail].label],['bad','!','Settled twice',`The provider paid ${fmt(b.settledAmt,b.cur)} for one charge`],['go','3','Leakage spots it','Same charge, two settlements'],['go','4','Refund suggested','Waits for a person to approve']);
    note = 'Without a check like this, the rider pays twice and finds out on their bank statement.';
  } else {
    const r=x, t=tx(r.txn);
    st.push(['ok','1',endLabel(t),`${fmt(t.amount,t.cur)} in ${city(t)}`],['bad','!','Payment declined',`${CODES[t.code].label}`]);
    if(r.fraudFlag) st.push(['bad','!','Fraud check','Card reported lost or stolen']);
    r.steps.forEach((s,i)=>st.push([s.ok?'ok':'n', String(i+2), ACTIONS[s.action].label, s.ok?'This worked':'Did not work']));
    if(r.recovered) st.push(['ok','✓','Paid', `${RAILS[t.rail].label}, matched to our records`]);
    else st.push(['go','→','Sent to collections', 'Friendly reminders, a person if needed']);
    note = r.fraudFlag ? 'Plain retry logic would have tried this card three more times. Card networks penalize that, and it never works.'
      : r.recovered ? `Leakage picked the order based on why it failed and this rider's history. Plain retries ${r.naiveOk?'would also have worked here':'would have failed here'}.`
      : 'Not every payment comes back right away. It moves to collections with a clear next step instead of being forgotten.';
  }
  $('#storyline').innerHTML = st.map(([c,i,t,d],n)=>`<div class="st" style="animation-delay:${n*80}ms"><div class="c ${c}" aria-hidden="true">${esc(i)}</div><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div>`).join('');
  $('#storynote').textContent = note;
}
function endLabel(t){ return {ride:'Ride ends',charging:'Charging ends',subscription:'Renewal due',service:'Service done'}[t.product]; }

// ---- fix issues ----
function setSeg(k){ segK=k; groupK=null; openId=null; showN=6; document.querySelectorAll('#seg button').forEach(b=>b.setAttribute('aria-selected', b.dataset.k===k)); renderFix(); }
function groupsFor(){
  if(segK==='failed') return FAIL_GROUPS.map(g=>{ const rs=S.recovery.filter(r=>g.codes.includes(tx(r.txn).code)); return {...g, n:rs.length, usd:rs.reduce((a,r)=>a+tx(r.txn).usd,0), good:rs.filter(r=>r.recovered).reduce((a,r)=>a+tx(r.txn).usd,0), items:rs.sort((a,b)=>tx(b.txn).usd-tx(a.txn).usd)}; }).filter(g=>g.n);
  if(segK==='mismatch') return MISMATCH_GROUPS.map(g=>{ const rs=S.recon.breaks.filter(b=>b.type===g.k); return {...g, n:rs.length, usd:rs.reduce((a,b)=>a+b.diffUsd,0), items:rs.sort((a,b)=>b.diffUsd-a.diffUsd)}; }).filter(g=>g.n);
  return UNPAID_GROUPS.map(g=>{ const rs=S.collections.filter(g.test); return {...g, n:rs.length, usd:rs.reduce((a,c)=>a+c.usd,0), items:rs}; }).filter(g=>g.n);
}
function renderFix(){
  const gs = groupsFor();
  if(!groupK || !gs.find(g=>g.k===groupK)) groupK = gs.slice().sort((a,b)=>b.usd-a.usd)[0]?.k;
  $('#groups').innerHTML = gs.map(g=>`<button class="group" aria-pressed="${g.k===groupK}" data-g="${g.k}"><div class="gt"><span>${esc(g.title)}</span><span>${K(g.usd)}</span></div><div class="gm"><span>${g.n} ${segK==='unpaid'?'accounts':segK==='mismatch'?'cases':'payments'}</span>${g.good!==undefined?`<span style="color:var(--green)">${K(g.good)} recovered</span>`:''}</div></button>`).join('');
  $('#groups').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ groupK=b.dataset.g; openId=null; showN=6; renderFix(); if(innerWidth<860) $('#panel').scrollIntoView({block:'start'}); });
  const g = gs.find(x=>x.k===groupK);
  if(!g){ $('#panel').innerHTML='<p class="muted">Nothing here this week.</p>'; return; }
  const list = g.items.slice(0,showN);
  $('#panel').innerHTML = `<div class="ph"><div><h3>${esc(g.title)}</h3><p class="small muted">${g.n} ${segK==='unpaid'?'accounts':segK==='mismatch'?'cases':'payments'}, ${K(g.usd)} in total. Largest first.</p></div></div>
    <div class="howto"><b>What Leakage does:</b> ${esc(g.plan)}</div>
    <div class="items">${list.map(itemRow).join('')}</div>
    ${g.items.length>showN?`<button class="ghost more" id="showmore">Show ${Math.min(6,g.items.length-showN)} more</button>`:''}`;
  $('#panel').querySelectorAll('.item > button').forEach(b=>b.onclick=()=>{ openId = openId===b.dataset.id?null:b.dataset.id; renderFix(); });
  const sm=$('#showmore'); if(sm) sm.onclick=()=>{ showN+=6; renderFix(); };
  if(openId) bindBody(openId);
}
function itemRow(x){
  let id, title, sub, amt, pill;
  if(segK==='failed'){ const t=tx(x.txn); id=t.id; title=`${what(t)} in ${city(t)}`; sub=`${RAILS[t.rail].label}, ${CODES[t.code].label.toLowerCase()}`; amt=fmt(t.amount,t.cur); pill = x.recovered?'<span class="pill p-ok">Recovered</span>':'<span class="pill p-warn">Following up</span>'; }
  else if(segK==='mismatch'){ const t=S.txByRef[x.ref]; id=x.ref; title= t?`${what(t)} in ${city(t)}`:`Kiosk session ${x.ref}`; sub = t?`${RAILS[t.rail].label} via ${t.partner||RAILS[t.rail].provider}`:(x.provider||''); amt=usd2(x.diffUsd); pill = statusPill(x.status); }
  else { id=x.id; title = x.kind==='partner'?x.partner:`Rider ${x.customer}`; sub = x.kind==='partner'?`Partner invoice, ${x.daysPastDue} days late`:`${what(S.txById[x.txn])}, ${x.daysPastDue} days late`; amt=fmt(x.amount,x.cur); pill = x.fraud?'<span class="pill p-bad">Fraud check</span>':x.dispute?'<span class="pill p-warn">Disputed</span>':`<span class="pill p-n">${x.risk} risk</span>`; }
  const open = openId===id;
  return `<div class="item${open?' open':''}"><button data-id="${esc(id)}" aria-expanded="${open}"><div><div class="it">${esc(title)}</div><div class="is">${esc(sub)}</div></div><div>${pill}</div><div class="amt">${esc(amt)} ${CHEV}</div></button>${open?`<div class="body" id="body">${bodyFor(x)}</div>`:''}</div>`;
}
function statusPill(s){ return {auto_resolved:'<span class="pill p-ok">Auto-fixed</span>', needs_review:'<span class="pill p-warn">Needs review</span>', queued:'<span class="pill p-go">Waiting for OK</span>', resolved:'<span class="pill p-ok">Fixed</span>'}[s]||''; }
function bodyFor(x){
  if(segK==='failed'){
    const t=tx(x.txn), c=S.data.custById[t.customer];
    const steps = x.plan.map((s,i)=>{ const done=x.steps[i]; const st = done? (done.ok?['ok','Worked']:['n','Tried']) : ['n','Not needed'];
      return `<div class="step"><span class="n" style="background:${st[0]==='ok'?'var(--green-soft)':'var(--soft)'};color:${st[0]==='ok'?'var(--green)':'var(--muted)'}">${i+1}</span><span>${esc(ACTIONS[s.action].label)}</span><span class="pill ${st[0]==='ok'?'p-ok':'p-n'}" style="margin-left:auto">${st[1]}</span></div>`; }).join('');
    return `<p class="small" style="margin-top:12px">${esc(x.reason)}</p><div class="steps">${steps}</div>
      <div class="facts"><span>Rider pays on time <b>${Math.round(c.onTime*100)}%</b></span><span>Backup card <b>${c.hasBackup?'yes':'no'}</b></span><span>Chance of recovery <b>${Math.round(x.pRecover*100)}%</b></span></div>
      <p class="note">Plain retries: ${x.naiveOk?'would have worked':'would have failed'}${x.naiveViolations?`, and broken card-network rules ${x.naiveViolations} times`:''}.</p>`;
  }
  if(segK==='mismatch'){
    return `<p style="margin-top:12px">${esc(x.explanation)}</p><div class="facts"><span>We charged <b>${x.ledgerAmt?fmt(x.ledgerAmt,x.cur):'nothing'}</b></span><span>Provider paid <b>${x.settledAmt?fmt(x.settledAmt,x.cur):'nothing yet'}</b></span><span>Confidence <b>${Math.round(x.confidence*100)}%</b></span></div>
      <p class="note"><b>Suggested fix:</b> ${esc(x.fix)}</p>${x.status==='needs_review'?'<div class="actions"><button class="primary" data-act="fix">Send fix for approval</button></div>':''}`;
  }
  const gate = checkAction({type:'send_message', dispute:x.dispute||x.fraud});
  return `${x.fraud?'<p class="note">Linked to a lost or stolen card. No messages until a fraud check clears it.</p>':''}${x.dispute?'<p class="note">This charge was disputed, so a person reviews it before anything is sent.</p>':''}
    <div class="facts"><span>Likely to pay without help <b>${Math.round(x.pSelfCure*100)}%</b></span><span>Channel <b>${esc(x.channel)}</b></span><span>Next step <b>${esc(x.stage)}</b></span></div>
    <p class="small" style="margin-top:14px;font-weight:700">Drafted message</p><div class="msg" id="draft">${esc(draftMessage(x))}</div>
    <div class="actions"><button class="primary" data-act="send">${gate.needsApproval?'Send to a person':'Send for approval'}</button><button data-act="rewrite" ${sampleFn?'':'hidden'}>Rewrite with AI</button></div><p class="note" id="rwnote"></p>`;
}
function bindBody(id){
  const body=$('#body'); if(!body) return;
  if(segK==='mismatch'){ const b=S.breakByRef[id]; const f=body.querySelector('[data-act="fix"]'); if(f) f.onclick=()=>{ const type={duplicate:'refund'}[b.type]||'open_trace'; propose({type, target:b.ref, usd:b.diffUsd, reason:b.label}, 'Reconciliation agent'); b.status='queued'; renderFix(); }; }
  if(segK==='unpaid'){ const c=S.collections.find(x=>x.id===id);
    body.querySelector('[data-act="send"]').onclick=()=>{ propose({type:'send_message', target:c.id, usd:c.usd, message:$('#draft').textContent, reason:c.stage, dispute:c.dispute||c.fraud}, 'Collections agent'); $('#rwnote').textContent='Sent to "Waiting for your OK" in Ask Leakage.'; };
    const rw=body.querySelector('[data-act="rewrite"]'); if(rw) rw.onclick=()=>rewrite(c, rw); }
}
async function rewrite(c, btn){
  btn.disabled=true; $('#rwnote').textContent='Writing...';
  const ctx = c.kind==='partner' ? `Business partner "${c.partner}" (a charge-card network), invoice ${c.id} for ${fmt(c.amount,c.cur)}, ${c.daysPastDue} days overdue.` : `A rider who still owes ${fmt(c.amount,c.cur)} for a ${what(S.txById[c.txn]).toLowerCase()}, ${c.daysPastDue} days late${c.dispute?', and has disputed the charge':''}.`;
  try{ const {text} = await sampleFn(`Write one short, warm payment reminder (under 60 words) for this account. Respectful, no threats, no guilt. Mention the amount, one easy way to pay, and how to question the charge. Plain text only.\n\nAccount: ${ctx}`, {modelTier:'quick', onText:({text})=>{ $('#draft').textContent=text; }});
    $('#draft').textContent=text; $('#rwnote').textContent='Rewritten by AI. It still waits for approval before sending.'; log('Collections agent', `rewrote the message for ${c.id} with AI.`);
  }catch(e){ $('#rwnote').textContent=errText(e); } finally{ btn.disabled=false; }
}

// ---- approvals ----
function propose(a, who){
  const gate = checkAction({type: a.type==='open_trace'||a.type==='switch_backup'?'other':a.type, usd:a.usd, codeKind:a.codeKind, attempts:a.attempts, dispute:a.dispute});
  if(!gate.allowed){ log('Safety check', `blocked "${a.type.replace('_',' ')}" on ${a.target}. ${gate.reason}`); return {status:'blocked', reason:gate.reason}; }
  const it={id:'A-'+(apprSeq++), ...a, who, gate:gate.reason, status:'pending'}; approvals.unshift(it);
  log(who, `suggested "${friendlyAct(a.type)}" for ${a.target}.`); renderWaiting();
  return {status:'waiting_for_human_approval', approval_id:it.id, note:gate.reason};
}
function friendlyAct(t){ return {refund:'refund the customer', write_off:'write it off', retry:'retry the payment', send_message:'send a message', switch_backup:'charge the backup card', open_trace:'ask the provider to trace it'}[t]||t; }
function renderWaiting(){
  const pend=approvals.filter(a=>a.status==='pending');
  const bd=$('#navbadge'); bd.textContent=pend.length; bd.hidden=!pend.length;
  $('#waitlist').innerHTML = approvals.length ? approvals.slice(0,8).map(a=>`<div class="wa"><div class="wt">${esc(friendlyAct(a.type)[0].toUpperCase()+friendlyAct(a.type).slice(1))}</div>
    <div class="tiny muted">${esc(a.target)}${a.usd?`, ${usd2(a.usd)}`:''}, from ${esc(a.who)}</div>
    ${a.status==='pending'?`<div class="actions" style="margin-top:8px"><button class="primary" data-ok="${a.id}">Approve</button><button data-no="${a.id}">Decline</button></div>`:`<span class="pill ${a.status==='approved'?'p-ok':'p-n'}" style="margin-top:8px">${a.status==='approved'?'Approved':'Declined'}</span>`}</div>`).join('')
    : '<p class="small muted" style="margin-top:14px">Nothing yet. Send a fix from "Fix issues", or ask the assistant for a suggestion.</p>';
  $('#waitlist').querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>decide(b.dataset.ok,true));
  $('#waitlist').querySelectorAll('[data-no]').forEach(b=>b.onclick=()=>decide(b.dataset.no,false));
}
function decide(id, ok){ const a=approvals.find(x=>x.id===id); a.status=ok?'approved':'declined'; if(ok&&S.breakByRef[a.target]){ S.breakByRef[a.target].status='resolved'; if(segK==='mismatch') renderFix(); } log('You', `${ok?'approved':'declined'} "${friendlyAct(a.type)}" for ${a.target}.`); renderWaiting(); }

// ---- evals ----
function renderEvals(){
  const ev=runEvals(); const p=ev.filter(e=>e.pass).length; const nv=ev.filter(e=>e.naive!==null), np=nv.filter(e=>e.naive).length;
  $('#evsum').textContent = `Leakage passes ${p} of ${ev.length}. Plain retries pass ${np} of ${nv.length} of the payment cases.`;
  $('#evbody').innerHTML = ev.map(e=>`<tr><td>${esc(e.name)}</td><td>${e.pass?'<span class="pill p-ok">Pass</span>':'<span class="pill p-bad">Fail</span>'}</td><td>${e.naive===null?'<span class="tiny muted">n/a</span>':e.naive?'<span class="pill p-ok">Pass</span>':'<span class="pill p-bad">Fail</span>'}</td></tr>`).join('');
}

// ---- AI explainer ----
const AI = [
  {kind:'Prediction model', c:'p-go', name:'Smart recovery', what:'Scores every way to recover a failed payment and picks the best order to try them.', tech:'Scores each option from the decline reason, payment method, and rider history. Here it is a hand-tuned scoring table; with real data it becomes a trained model (gradient-boosted trees).'},
  {kind:'Rules engine', c:'p-n', name:'Money matching', what:'Compares every charge with what each provider actually paid and names the problem.', tech:'Deterministic matching with tolerances (for example, rounding under 10 cents). Rules, not a language model, because money records must be exact and repeatable.'},
  {kind:'Risk scoring', c:'p-go', name:'Collections priority', what:'Ranks unpaid accounts by how much money is likely lost if nobody acts.', tech:'Amount times the chance it stays unpaid times how late it is. Disputes and fraud skip the queue and go to a person.'},
  {kind:'Language model', c:'p-ok', name:'Assistant and messages', what:'Answers questions about the week and writes friendly reminder messages.', tech:'A language model with tool calling (Claude inside Claude, an open model on Groq on the web). It can only read data through five lookup tools and suggest actions through one. It never moves money.'},
  {kind:'Safety layer', c:'p-warn', name:'Guardrails and approval', what:'Stops unsafe actions and sends risky ones to a person.', tech:'Hard rules checked on every action: no retries on dead or stolen cards, at most 3 attempts, refunds over $100 and write-offs over $25 need approval.'},
  {kind:'Testing', c:'p-n', name:'Evals', what:'A fixed set of tricky cases the logic must pass before any change ships.', tech:`${18} golden cases covering recovery, matching, and safety rules. Run them below.`},
];
function renderAI(){ $('#aigrid').innerHTML = AI.map(a=>`<div class="card aic"><span class="pill ${a.c} kind">${a.kind}</span><h3>${a.name}</h3><p>${a.what}</p><div class="tech">${a.tech}</div></div>`).join(''); }

// ---- assistant ----
let sampleFn=null, turns=[], ctl=null, cpReady=false;
const RULES = `You are the Leakage assistant: a friendly helper for a car company's payments team (Robotaxi rides, Supercharging, subscriptions, service). All data is a simulated week. Always use tools for numbers; never invent them. You can only SUGGEST actions with suggest_action; a person approves them, so never say something was done. Write like a helpful colleague: plain words, short paragraphs, lead with the answer, use USD. No markdown headers or tables. If a safety rule blocks something, say so kindly in one line and offer a safe alternative. Use as few tool calls as you need (usually 1 to 3); prefer one call with group_by over many separate calls. Only suggest an action when the person asks for one.`;
const TOOL_NAMES = {get_summary:'Checked the weekly summary', find_failed_payments:'Looked through failed payments', get_payment:'Opened a payment', list_mismatches:'Checked money mismatches', list_unpaid:'Checked unpaid accounts', suggest_action:'Sent a suggestion for your OK'};
const TOOLS = () => [
  {name:'get_summary', description:'Totals for the week.', inputSchema:{type:'object',properties:{}}, execute:()=>{ const k=S.k; return {billed_usd:Math.round(k.billed), payments:S.data.txns.length, failed_usd:Math.round(k.failed), failed_count:k.nFailed, recovered_usd:Math.round(k.smart), plain_retry_recovered_usd:Math.round(k.naive), plain_retry_rule_violations:k.viol, unpaid_riders_usd:Math.round(k.unpaidRiders), overdue_partner_invoices_usd:Math.round(k.partnerUsd), mismatches:k.nBreaks, mismatch_usd:Math.round(k.mis), waiting_for_approval:approvals.filter(a=>a.status==='pending').length}; }},
  {name:'find_failed_payments', description:'Failed payments, largest first. Optional filters, or group_by for totals.', inputSchema:{type:'object',properties:{rail:{type:'string',enum:Object.keys(RAILS)},market:{type:'string',enum:Object.keys(MARKETS)},product:{type:'string',enum:Object.keys(PRODUCTS)},code:{type:'string',enum:Object.keys(CODES)},recovered:{type:'boolean'},group_by:{type:'string',enum:['rail','market','product','code']},limit:{type:'integer'}}}, execute:(q)=>{
    let rs=S.recovery.filter(r=>{const t=tx(r.txn); return (!q.rail||t.rail===q.rail)&&(!q.market||t.market===q.market)&&(!q.product||t.product===q.product)&&(!q.code||t.code===q.code)&&(q.recovered===undefined||r.recovered===q.recovered);});
    if(q.group_by){ const g={}; for(const r of rs){const t=tx(r.txn); const o=(g[t[q.group_by]] ||= {failed_usd:0,recovered_usd:0,count:0}); o.count++; o.failed_usd+=t.usd; if(r.recovered)o.recovered_usd+=t.usd;} for(const k in g){g[k].failed_usd=Math.round(g[k].failed_usd); g[k].recovered_usd=Math.round(g[k].recovered_usd);} return g; }
    rs.sort((a,b)=>tx(b.txn).usd-tx(a.txn).usd);
    return {total:rs.length, items:rs.slice(0,Math.min(q.limit||8,20)).map(r=>{const t=tx(r.txn); return {id:t.id, what:t.product, city:MARKETS[t.market].city, method:RAILS[t.rail].label, usd:t.usd, reason:CODES[t.code].label, plan:r.plan.map(s=>ACTIONS[s.action].label), recovered:r.recovered};})}; }},
  {name:'get_payment', description:'Details for one payment id (T-...).', inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}, execute:({id})=>{ const t=tx(id); if(!t) throw new Error('No payment with id '+id); const r=S.recById[id], c=S.data.custById[t.customer]; return {id:t.id, what:t.product, city:MARKETS[t.market].city, method:RAILS[t.rail].label, amount:fmt(t.amount,t.cur), usd:t.usd, status:t.status, reason:t.code?CODES[t.code].label:null, recovery:r?{why:r.reason, plan:r.plan.map(s=>ACTIONS[s.action].label), recovered:r.recovered, fraud_flag:r.fraudFlag}:null, rider:{on_time:c.onTime, has_backup_card:c.hasBackup}, mismatch:S.breakByRef[t.ref]?.explanation||null}; }},
  {name:'list_mismatches', description:'Money mismatches, largest first.', inputSchema:{type:'object',properties:{type:{type:'string',enum:Object.keys(BREAK_INFO)},limit:{type:'integer'}}}, execute:(q)=>{ const rs=S.recon.breaks.filter(b=>!q.type||b.type===q.type).sort((a,b)=>b.diffUsd-a.diffUsd); return {total:rs.length, total_usd:Math.round(rs.reduce((a,b)=>a+b.diffUsd,0)), items:rs.slice(0,Math.min(q.limit||8,20)).map(b=>({ref:b.ref, problem:b.label, usd:b.diffUsd, explanation:b.explanation, fix:b.fix, status:b.status}))}; }},
  {name:'list_unpaid', description:'Unpaid accounts by priority.', inputSchema:{type:'object',properties:{kind:{type:'string',enum:['consumer','partner']},needs_person:{type:'boolean'},limit:{type:'integer'}}}, execute:(q)=>{ const rs=S.collections.filter(c=>(!q.kind||c.kind===q.kind)&&(q.needs_person===undefined||(c.owner==='human')===q.needs_person)); return {total:rs.length, items:rs.slice(0,Math.min(q.limit||8,20)).map(c=>({id:c.id, who:c.partner||c.customer, usd:c.usd, days_late:c.daysPastDue, risk:c.risk, next_step:c.stage, needs_person:c.owner==='human', disputed:c.dispute, fraud:c.fraud}))}; }},
  {name:'suggest_action', description:'Suggest an action for a person to approve. Safety rules apply. type: refund | write_off | retry | send_message | switch_backup | open_trace.', inputSchema:{type:'object',properties:{type:{type:'string',enum:['refund','write_off','retry','send_message','switch_backup','open_trace']},target_id:{type:'string'},usd:{type:'number'},message:{type:'string'},reason:{type:'string'}},required:['type','target_id','reason']}, execute:(a)=>{
    const t=tx(a.target_id), r=t&&S.recById[t.id], col=S.collections.find(c=>c.id===a.target_id);
    return propose({type:a.type, target:a.target_id, usd:a.usd ?? (t?t.usd:col?col.usd:S.breakByRef[a.target_id]?.diffUsd), message:a.message, reason:a.reason, codeKind:r?r.kind:undefined, attempts:r?r.steps.length:0, dispute:col?(col.dispute||col.fraud):false}, 'Assistant'); }},
];
const STARTERS = [
  {q:'Where are we losing the most money this week?', s:'A quick overview'},
  {q:'What should I fix first today?', s:'Prioritized to-do list'},
  {q:'Explain the double charges and suggest fixes', s:'Mismatch walkthrough'},
  {q:'Retry the biggest payment from a stolen card', s:'See the safety rules work'},
];
function errText(e){ return ({not_granted:'AI access was turned off for this page.', rate_limited:'Lots of requests right now. Try again in a minute.', cancelled:'Stopped.'})[e?.code] || ('The assistant could not answer that. Please try again.' + (e?.detail ? '\n\nDetails: '+e.detail : '')); }
function bubble(cls, text, before){ const d=document.createElement('div'); d.className=cls; d.textContent=text; const chat=$('#chat'); before?chat.insertBefore(d,before):chat.appendChild(d); chat.scrollTop=chat.scrollHeight; return d; }
function welcome(){
  $('#chat').innerHTML='';
  bubble('b ai', !cpReady ? 'Connecting...' : sampleFn ? 'Hi! I can look up anything in this week\'s payments and suggest fixes. I never move money myself; you approve everything. Try one of these:' : 'The assistant is not connected on this copy of the page. Everything else works without it.');
  if(sampleFn){ const w=document.createElement('div'); w.className='starters'; w.innerHTML=STARTERS.map(s=>`<button>${esc(s.q)}<span>${esc(s.s)}</span></button>`).join(''); $('#chat').appendChild(w); w.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>ask(STARTERS[i].q)); }
}
async function ask(q){
  if(!q.trim()||!sampleFn) return;
  document.querySelector('.starters')?.remove();
  bubble('b me', q); $('#askbox').value=''; turns.push({role:'user', content:q});
  const out=bubble('b ai','Thinking...');
  $('#send').disabled=true; $('#stop').hidden=false; ctl=new AbortController();
  const tools=TOOLS().map(t=>({...t, execute:(input)=>{ bubble('tool', TOOL_NAMES[t.name]||t.name, out); return t.execute(input||{}); }}));
  try{ const {text}=await sampleFn([{role:'user',content:RULES},{role:'assistant',content:'Got it.'},...turns.slice(-8)], {tools, signal:ctl.signal, cache:false, onText:({text})=>{ out.textContent=text; $('#chat').scrollTop=$('#chat').scrollHeight; }});
    out.textContent=text; turns.push({role:'assistant', content:text});
  }catch(e){ out.textContent=(e.text?e.text+'\n\n':'')+errText(e); turns.pop(); }
  finally{ $('#send').disabled=false; $('#stop').hidden=true; }
}

// ---- web fallback: Groq via our own /api/chat (key stays on the server) ----
let cpBackend = null;
async function groqSample(input, opts={}){
  const msgs = typeof input==='string' ? [{role:'user', content:input}] : input.map(m=>({role:m.role, content:m.content}));
  // our rules message becomes a proper system message
  if(msgs[0] && msgs[0].content===RULES){ msgs.splice(0,2,{role:'system', content:RULES}); }
  const tools = opts.tools||[];
  const toolDefs = tools.map(t=>({type:'function', function:{name:t.name, description:t.description, parameters:t.inputSchema||{type:'object',properties:{}}}}));
  const MAX_ROUNDS = 10;
  for(let round=0; round<MAX_ROUNDS; round++){
    const last = round===MAX_ROUNDS-1;
    // final round: no tools, so the model must answer with what it has
    const body = last ? {messages:[...msgs, {role:'system', content:'Stop looking things up. Answer now using what you found.'}], tools:[]} : {messages:msgs, tools:toolDefs};
    let r;
    try{ r = await fetch('/api/chat',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:opts.signal}); }
    catch(e){ throw {code: e.name==='AbortError'?'cancelled':'error'}; }
    let j = {}; try{ j = await r.json(); }catch(e){}
    if(r.status===429) throw {code:'rate_limited'};
    if(!r.ok) throw {code:'error', detail: j.error || ('HTTP '+r.status)};
    const m = j.message || {};
    if(m.tool_calls && m.tool_calls.length && !last){
      msgs.push({role:'assistant', content:m.content||'', tool_calls:m.tool_calls});
      for(const tc of m.tool_calls){
        const t = tools.find(x=>x.name===tc.function?.name);
        let out;
        try{ const args = JSON.parse(tc.function.arguments||'{}'); out = t ? await t.execute(args) : {error:'Unknown tool'}; }
        catch(e){ out = {error:String(e?.message||e)}; }
        msgs.push({role:'tool', tool_call_id:tc.id, content:JSON.stringify(out)});
      }
      continue;
    }
    const text = m.content || '';
    opts.onText?.({text});
    return {text};
  }
  throw {code:'error', detail:'The assistant ran out of steps.'};
}
async function connectAssistant(){
  // 1) Inside Claude: use Claude through the viewer's account
  try{ if(window.claude){ const f = await window.claude.use('sample'); if(f){ cpBackend='Claude'; return f; } } }catch(e){}
  // 2) On the web (Vercel): use our Groq function if it is configured
  try{ const r = await fetch('/api/chat'); if(r.ok){ const j = await r.json(); if(j.configured){ cpBackend='Groq'; return groqSample; } } }catch(e){}
  return null;
}

// ---- wire up ----
document.querySelectorAll('#seg button').forEach(b=>b.onclick=()=>setSeg(b.dataset.k));
$('#vol').onchange=build;
$('#regen').onclick=()=>{ seed=Math.floor(Math.random()*1e6); build(); };
$('#send').onclick=()=>ask($('#askbox').value);
$('#stop').onclick=()=>ctl?.abort();
$('#askbox').onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); ask($('#askbox').value);} };
renderAI(); build(); welcome();
(async()=>{
  sampleFn = await connectAssistant();
  cpReady=true;
  $('#cpstatus').textContent = sampleFn ? (cpBackend==='Claude' ? 'Online, powered by Claude' : 'Online, powered by Groq') : 'Not connected';
  $('#send').disabled = !sampleFn; $('#askbox').disabled = !sampleFn;
  welcome(); if(segK==='unpaid') renderFix();
})();
