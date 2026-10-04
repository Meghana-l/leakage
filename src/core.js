// ===== Leakage core engine (pure logic, no DOM) =====
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function pickW(rng, items){ let r=rng()*items.reduce((s,i)=>s+i[1],0); for(const [v,w] of items){ if((r-=w)<=0) return v; } return items[items.length-1][0]; }
const round2 = x => Math.round(x*100)/100;

const MARKETS = {
  AUS:{city:'Austin', cur:'USD', fx:1, robotaxi:true},
  SFO:{city:'Bay Area', cur:'USD', fx:1, robotaxi:true},
  BER:{city:'Berlin', cur:'EUR', fx:1.08},
  OSL:{city:'Oslo', cur:'NOK', fx:0.094},
  LON:{city:'London', cur:'GBP', fx:1.27},
  TOR:{city:'Toronto', cur:'CAD', fx:0.73},
};
const PRODUCTS = {
  ride:{label:'Robotaxi ride'}, charging:{label:'Supercharging'},
  subscription:{label:'Subscription'}, service:{label:'Service invoice'}
};
const RAILS = {
  card:{label:'Saved card', provider:'Card processor', fee:0.029, fixed:0.30, decline:0.060},
  apple_pay:{label:'Apple Pay', provider:'Card processor', fee:0.029, fixed:0.30, decline:0.030},
  google_pay:{label:'Google Pay', provider:'Card processor', fee:0.029, fixed:0.30, decline:0.035},
  x_money:{label:'X Money', provider:'X Money', fee:0.015, fixed:0, decline:0.050},
  kiosk:{label:'V4 kiosk', provider:'Kiosk acquirer', fee:0.032, fixed:0.10, decline:0.040},
  partner_card:{label:'Partner charge card', provider:'Partner network', fee:0.010, fixed:0, decline:0.020},
  tesla_credit:{label:'Tesla credits', provider:'Internal', fee:0, fixed:0, decline:0.006},
};
const CODES = {
  '51':{label:'Insufficient funds', kind:'soft'},
  '05':{label:'Do not honor', kind:'soft'},
  '91':{label:'Issuer unavailable', kind:'soft'},
  '61':{label:'Exceeds spending limit', kind:'soft'},
  'BAL':{label:'Wallet balance too low', kind:'soft'},
  '54':{label:'Expired card', kind:'hard_update'},
  '14':{label:'Invalid card number', kind:'hard_update'},
  'TK':{label:'Wallet token suspended', kind:'hard_update'},
  '41':{label:'Lost card', kind:'hard_fraud'},
  '43':{label:'Stolen card', kind:'hard_fraud'},
};
const ACTIONS = {
  retry_now:{label:'Retry immediately'},
  retry_1h:{label:'Retry in 1 hour'},
  retry_24h:{label:'Retry in 24 hours'},
  retry_payday:{label:'Retry on payday morning'},
  switch_backup:{label:'Charge backup method in wallet'},
  message_update:{label:'Ask rider to update payment method'},
  message_pay:{label:'Send in-app pay link'},
  message_topup:{label:'Ask rider to top up wallet'},
};
const isRetry = a => a.startsWith('retry');
const PARTNERS = ['RoamLink','VoltCard EU','FleetPay Pro','ChargeNet Fleet'];
const WEEK_START = Date.UTC(2026,8,28); // Mon Sep 28 2026
const DAY = 86400000;
const AS_OF = WEEK_START + 7*DAY; // Oct 5 00:00 UTC, file cut

function declineCodeFor(rng, rail){
  if(rail==='tesla_credit') return 'BAL';
  if(rail==='x_money') return pickW(rng,[['BAL',.45],['05',.25],['91',.15],['41',.05],['61',.10]]);
  const base=[['51',.34],['05',.22],['91',.10],['61',.08],['54',.12],['14',.03],['41',.02],['43',.01]];
  if(rail==='apple_pay'||rail==='google_pay') base.push(['TK',.08]);
  return pickW(rng, base);
}

function generate(opts={}){
  const n = opts.count||10000, seed = opts.seed||2026;
  const rng = mulberry32(seed);
  const customers = [];
  const nCust = Math.max(200, Math.round(n/6));
  for(let i=0;i<nCust;i++){
    customers.push({ id:'C-'+(10000+i), tenure: Math.floor(rng()*60)+1,
      onTime: round2(0.55+rng()*0.45), hasBackup: rng()<0.45,
      payday: pickW(rng,[[5,.6],[1,.15],[3,.15],[4,.1]]) });
  }
  const mkeys = Object.keys(MARKETS);
  const txns = [];
  for(let i=0;i<n;i++){
    const product = pickW(rng,[['ride',.42],['charging',.40],['subscription',.12],['service',.06]]);
    let market = product==='ride' ? pickW(rng,[['AUS',.6],['SFO',.4]]) : pickW(rng,mkeys.map(k=>[k, k==='AUS'||k==='SFO'?.22:.14]));
    const m = MARKETS[market];
    let rail;
    if(product==='ride') rail = pickW(rng,[['card',.55],['apple_pay',.25],['google_pay',.12],['x_money',.08]]);
    else if(product==='charging') rail = pickW(rng,[['card',.55],['apple_pay',.10],['google_pay',.05],['kiosk',.12],['partner_card',.13],['tesla_credit',.05]]);
    else if(product==='subscription') rail = pickW(rng,[['card',.8],['apple_pay',.1],['tesla_credit',.1]]);
    else rail = pickW(rng,[['card',.8],['apple_pay',.2]]);
    let usd;
    if(product==='ride') usd = 8+rng()*37;
    else if(product==='charging') usd = 12+rng()*48;
    else if(product==='subscription') usd = rng()<.6?9.99:99;
    else usd = 80+Math.pow(rng(),2)*820;
    const amount = round2(usd/m.fx);
    const cust = customers[Math.floor(rng()*customers.length)];
    const ts = WEEK_START + Math.floor(rng()*7*DAY);
    const declined = rng() < RAILS[rail].decline * (cust.onTime<0.7?1.6:1);
    const t = { id:'T-'+(500000+i), ref:'R'+(900000+i), product, market, rail, amount, cur:m.cur,
      usd: round2(usd), customer: cust.id, ts, status: declined?'declined':'approved' };
    if(rail==='partner_card') t.partner = PARTNERS[Math.floor(rng()*PARTNERS.length)];
    if(declined) t.code = declineCodeFor(rng, rail);
    txns.push(t);
  }
  return { seed, customers, custById: Object.fromEntries(customers.map(c=>[c.id,c])), txns };
}

// ---- hidden "real world" response, used only to simulate outcomes ----
function trueProb(t, c, action){
  const k = CODES[t.code].kind, code=t.code, ot=c.onTime;
  if(isRetry(action) && k!=='soft') return 0;
  if(action==='switch_backup') return c.hasBackup ? (k==='hard_fraud'?0.4:0.68) : 0;
  const T = {
    '51':{retry_now:.12, retry_1h:.15, retry_24h:.30, retry_payday:.62*ot/0.8, message_pay:.45},
    '05':{retry_now:.08, retry_1h:.12, retry_24h:.38, retry_payday:.30, message_pay:.40},
    '91':{retry_now:.55, retry_1h:.85, retry_24h:.80, retry_payday:.75, message_pay:.35},
    '61':{retry_now:.10, retry_1h:.12, retry_24h:.55, retry_payday:.50, message_pay:.42},
    'BAL':{retry_now:.05, retry_1h:.06, retry_24h:.25, retry_payday:.50, message_topup:.60, message_pay:.40},
    '54':{message_update:.55, message_pay:.45}, '14':{message_update:.50, message_pay:.40},
    'TK':{message_update:.60, message_pay:.45},
    '41':{message_update:.20, message_pay:.15}, '43':{message_update:.15, message_pay:.10},
  }[code];
  return Math.min(0.9, 0.8*(T[action]||0.02) * (0.6+0.5*ot));
}

// ---- our policy: an estimated model (approximates the world, not a copy) ----
function estProb(t, c, action){
  const k = CODES[t.code].kind;
  if(isRetry(action) && k!=='soft') return 0;
  if(action==='switch_backup') return c.hasBackup ? (k==='hard_fraud'?0.45:0.76) : 0;
  const E = {
    '51':{retry_now:.10, retry_1h:.14, retry_24h:.28, retry_payday:.58, message_pay:.42},
    '05':{retry_now:.10, retry_1h:.12, retry_24h:.35, retry_payday:.28, message_pay:.38},
    '91':{retry_now:.50, retry_1h:.82, retry_24h:.78, retry_payday:.70, message_pay:.30},
    '61':{retry_now:.10, retry_1h:.12, retry_24h:.50, retry_payday:.46, message_pay:.40},
    'BAL':{retry_now:.05, retry_1h:.05, retry_24h:.22, retry_payday:.46, message_topup:.57, message_pay:.38},
    '54':{message_update:.52, message_pay:.42}, '14':{message_update:.48, message_pay:.38},
    'TK':{message_update:.57, message_pay:.42},
    '41':{message_update:.18, message_pay:.12}, '43':{message_update:.14, message_pay:.10},
  }[t.code];
  return round2((E[action]||0.02) * (0.62+0.48*c.onTime));
}

const MAX_ATTEMPTS = 3;
function recoveryPlan(t, c){
  const kind = CODES[t.code].kind;
  const cands = Object.keys(ACTIONS).map(a=>({action:a, p:estProb(t,c,a)})).filter(x=>x.p>0).sort((a,b)=>b.p-a.p);
  const plan=[]; const used=new Set(); let retries=0;
  for(const cd of cands){
    if(plan.length>=MAX_ATTEMPTS) break;
    if(isRetry(cd.action)){ if(retries>=1) continue; retries++; }
    if(cd.action.startsWith('message') && plan.some(s=>s.action.startsWith('message'))) continue;
    if(used.has(cd.action)) continue;
    used.add(cd.action); plan.push(cd);
  }
  // order: issuer-side fixes before bothering the rider
  plan.sort((a,b)=> (a.action.startsWith('message')?1:0)-(b.action.startsWith('message')?1:0) || b.p-a.p);
  const pAll = 1-plan.reduce((s,x)=>s*(1-x.p),1);
  const reasons = {
    soft: 'Soft decline: the card is valid, so timing matters more than the method.',
    hard_update: 'Hard decline: retrying the same credential cannot succeed and breaks card-network retry rules.',
    hard_fraud: 'Card reported lost or stolen: never retry, flag for risk review, and only use a different method.'
  };
  return { plan, pRecover: round2(pAll), kind, fraudFlag: kind==='hard_fraud', reason: reasons[kind] };
}

function naivePlan(t){ return { plan:[{action:'retry_now'},{action:'retry_now'},{action:'retry_now'}] }; }

function simulateRecovery(data, seed){
  const rng = mulberry32((seed||data.seed)+7);
  const rngN = mulberry32((seed||data.seed)+11);
  const out=[];
  for(const t of data.txns){
    if(t.status!=='declined') continue;
    const c = data.custById[t.customer];
    const rp = recoveryPlan(t,c);
    let recoveredBy=null, steps=[];
    for(const s of rp.plan){
      const ok = rng() < trueProb(t,c,s.action);
      steps.push({action:s.action, p:s.p, ok});
      if(ok){ recoveredBy=s.action; break; }
    }
    // naive baseline: 3 immediate retries, hard declines count as rule violations
    let naiveOk=false, violations=0;
    for(let i=0;i<3;i++){
      const p = trueProb(t,c,'retry_now');
      if(CODES[t.code].kind!=='soft') violations++;
      if(rngN()<p){ naiveOk=true; break; }
    }
    out.push({ txn:t.id, ...rp, steps, recovered: !!recoveredBy, recoveredBy, naiveOk, naiveViolations: violations });
  }
  return out;
}

// ---- reconciliation ----
const FX_TOLERANCE_USD = 0.10;
function buildSettlements(data, recovery){
  const rng = mulberry32(data.seed+23);
  const recoveredIds = new Set(recovery.filter(r=>r.recovered).map(r=>r.txn));
  const rows=[]; const injected={};
  let sid=1;
  for(const t of data.txns){
    const collected = t.status==='approved' || recoveredIds.has(t.id);
    if(!collected || t.rail==='tesla_credit') continue;
    const r = RAILS[t.rail];
    const settleTs = t.ts + DAY*(1+Math.floor(rng()*2));
    const fee = round2(t.amount*r.fee + r.fixed/MARKETS[t.market].fx);
    const base = { sid:'S-'+(sid++), ref:t.ref, provider: t.partner||r.provider, gross:t.amount, fee, cur:t.cur, settledTs:settleTs };
    const x = rng();
    const nonUsd = t.cur!=='USD';
    if(x<0.010 && t.ts < AS_OF-3*DAY){ injected[t.ref]='missing'; continue; }
    if(x<0.014){ injected[t.ref]='duplicate'; rows.push(base); rows.push({...base, sid:'S-'+(sid++), settledTs:settleTs+3600000}); continue; }
    if(x<0.020){ injected[t.ref]='amount_mismatch'; const d = round2(t.amount*(0.1+rng()*0.4)); rows.push({...base, gross: round2(t.amount-d)}); continue; }
    if(x<0.026 && nonUsd){ injected[t.ref]='fx_rounding'; rows.push({...base, gross: round2(t.amount + (rng()<.5?-1:1)*(0.01+Math.floor(rng()*4)/100))}); continue; }
    if(x<0.031){ injected[t.ref]='fee_overcharge'; rows.push({...base, fee: round2(fee + t.amount*(0.008+rng()*0.012))}); continue; }
    rows.push(base);
  }
  // orphans: kiosk sessions that settled but never reached the ledger
  const nOrph = Math.max(2, Math.round(data.txns.length*0.0015));
  for(let i=0;i<nOrph;i++){
    const amt = round2(15+rng()*40);
    const ref='K'+(700000+i);
    injected[ref]='orphan';
    rows.push({ sid:'S-'+(sid++), ref, provider:'Kiosk acquirer', gross:amt, fee: round2(amt*0.032+0.10), cur:'USD', settledTs: WEEK_START+Math.floor(rng()*7*DAY) });
  }
  return { rows, injected };
}

function classifyBreaks(ledger, rows, asOf){
  // ledger: [{ref, amount, cur, rail, ts, market, collected}] ; rows: settlement rows
  const fxOf = c => ({USD:1,EUR:1.08,NOK:0.094,GBP:1.27,CAD:0.73})[c]||1;
  const byRef = {}; for(const r of rows){ (byRef[r.ref] ||= []).push(r); }
  const breaks=[]; let matched=0;
  const ledgerRefs = new Set();
  for(const l of ledger){
    if(!l.collected || l.rail==='tesla_credit') continue;
    ledgerRefs.add(l.ref);
    const s = byRef[l.ref]||[];
    const usd = v => v*fxOf(l.cur);
    if(s.length===0){
      if(asOf - l.ts > 3*DAY) breaks.push({ref:l.ref, type:'missing', ledgerAmt:l.amount, settledAmt:0, cur:l.cur, diffUsd: round2(usd(l.amount))});
      continue;
    }
    if(s.length>1){ breaks.push({ref:l.ref, type:'duplicate', ledgerAmt:l.amount, settledAmt: round2(s.reduce((a,b)=>a+b.gross,0)), cur:l.cur, diffUsd: round2(usd(l.amount*(s.length-1))), rows:s.map(x=>x.sid)}); continue; }
    const r = s[0];
    const d = round2(r.gross - l.amount);
    if(d!==0){
      const dUsd = Math.abs(usd(d));
      if(l.cur!=='USD' && dUsd <= FX_TOLERANCE_USD) breaks.push({ref:l.ref, type:'fx_rounding', ledgerAmt:l.amount, settledAmt:r.gross, cur:l.cur, diffUsd: round2(dUsd)});
      else breaks.push({ref:l.ref, type:'amount_mismatch', ledgerAmt:l.amount, settledAmt:r.gross, cur:l.cur, diffUsd: round2(dUsd)});
      continue;
    }
    const rail = RAILS[l.rail]; const expected = round2(l.amount*rail.fee + rail.fixed/fxOf(l.cur));
    if(r.fee - expected > Math.max(0.02, l.amount*0.003)){ breaks.push({ref:l.ref, type:'fee_overcharge', ledgerAmt:l.amount, settledAmt:r.gross, cur:l.cur, feeCharged:r.fee, feeExpected:expected, diffUsd: round2(usd(r.fee-expected))}); continue; }
    matched++;
  }
  for(const ref in byRef){ if(!ledgerRefs.has(ref)){ const r=byRef[ref][0]; breaks.push({ref, type:'orphan', ledgerAmt:0, settledAmt:r.gross, cur:r.cur, diffUsd: round2(r.gross*fxOf(r.cur)), provider:r.provider}); } }
  return { breaks: breaks.map(enrichBreak), matched };
}

const BREAK_INFO = {
  missing:{label:'Missing settlement', fix:'Open a trace with the provider; if not found in 5 days, re-present the charge.', conf:.86},
  duplicate:{label:'Duplicate settlement', fix:'Refund the extra charge to the customer and claim it back from the provider.', conf:.97},
  amount_mismatch:{label:'Amount mismatch', fix:'Check for a fare or session adjustment after capture; correct the ledger or bill the difference.', conf:.78},
  fx_rounding:{label:'Currency rounding', fix:'Write off automatically: within the $0.10 rounding tolerance.', conf:.99},
  fee_overcharge:{label:'Fee above contract', fix:'Flag to the provider for a fee credit under the contracted rate.', conf:.92},
  orphan:{label:'Settlement with no ledger entry', fix:'Likely a kiosk session that never synced. Create the ledger entry and link the receipt.', conf:.81},
};
function enrichBreak(b){
  const info = BREAK_INFO[b.type];
  const auto = b.type==='fx_rounding';
  const why = {
    missing:`We charged ${fmt(b.ledgerAmt,b.cur)} but no money from the provider has arrived after 3 days.`,
    duplicate:`The provider settled ${fmt(b.ledgerAmt,b.cur)} twice for one charge. The customer was likely billed twice.`,
    amount_mismatch:`We recorded ${fmt(b.ledgerAmt,b.cur)} but ${fmt(b.settledAmt,b.cur)} settled.`,
    fx_rounding:`A ${fmt(Math.abs(b.settledAmt-b.ledgerAmt),b.cur)} difference from currency rounding.`,
    fee_overcharge:`The provider took ${fmt(b.feeCharged,b.cur)} in fees; the contract says ${fmt(b.feeExpected,b.cur)}.`,
    orphan:`${fmt(b.settledAmt,b.cur)} arrived from ${b.provider||'a provider'} with no matching charge in our ledger.`,
  }[b.type];
  return { ...b, label:info.label, fix:info.fix, confidence:info.conf, autoResolve:auto, explanation:why, status: auto?'auto_resolved':'needs_review' };
}
function fmt(v,cur){ const sym={USD:'$',EUR:'€',GBP:'£',CAD:'C$',NOK:'kr '}[cur]||''; return sym+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// ---- collections ----
function buildCollections(data, recovery){
  const rng = mulberry32(data.seed+31);
  const items=[];
  const txById = Object.fromEntries(data.txns.map(t=>[t.id,t]));
  for(const r of recovery){
    if(r.recovered) continue;
    const t = txById[r.txn], c = data.custById[t.customer];
    const pSelfCure = round2(0.15 + 0.5*c.onTime*(r.kind==='soft'?1:0.6));
    const dispute = rng()<0.07;
    items.push({ id:'COL-'+t.id.slice(2), kind:'consumer', txn:t.id, customer:t.customer, product:t.product, market:t.market,
      amount:t.amount, cur:t.cur, usd:t.usd, daysPastDue: Math.max(1, Math.floor((AS_OF-t.ts)/DAY)), pSelfCure, dispute,
      fraud: r.fraudFlag });
  }
  // B2B partner receivables: last month's partner charge-card sessions, net-30
  for(const p of PARTNERS){
    for(let k=0;k<2;k++){
      const usd = round2(8000+rng()*42000);
      const dpd = Math.floor(rng()*70);
      items.push({ id:`COL-${p.replace(/\W/g,'').slice(0,6).toUpperCase()}-${k+1}`, kind:'partner', partner:p, product:'charging', market: p==='VoltCard EU'?'BER':'AUS',
        amount: p==='VoltCard EU'? round2(usd/1.08):usd, cur: p==='VoltCard EU'?'EUR':'USD', usd, daysPastDue:dpd,
        pSelfCure: round2(dpd<15?0.85:dpd<45?0.55:0.3), dispute: rng()<0.12, fraud:false });
    }
  }
  for(const it of items){
    const age = 1 + Math.min(it.daysPastDue,90)/30;
    it.priority = round2(it.usd*(1-it.pSelfCure)*age);
    it.risk = it.pSelfCure>0.6?'low':it.pSelfCure>0.4?'medium':'high';
    if(it.fraud){ it.stage='Risk review'; it.owner='human'; it.channel='None until reviewed'; }
    else if(it.dispute){ it.stage='Dispute'; it.owner='human'; it.channel=it.kind==='partner'?'Account manager':'Support agent'; }
    else if(it.kind==='partner'){ it.stage = it.daysPastDue<15?'Friendly reminder':it.daysPastDue<45?'Second notice':'Escalate to finance'; it.owner= it.daysPastDue>=45?'human':'agent'; it.channel='Email to AP contact'; }
    else { it.stage = it.daysPastDue<3?'In-app reminder':'Pay link + email'; it.owner='agent'; it.channel='Tesla app push'; }
  }
  items.sort((a,b)=>b.priority-a.priority);
  return items;
}

function draftMessage(it){
  if(it.kind==='partner') return `Hi ${it.partner} team, invoice ${it.id} for ${fmt(it.amount,it.cur)} in Supercharging sessions is ${it.daysPastDue} days past due. Could you confirm a payment date? If any sessions look wrong, reply with the session IDs and we'll review them before the next statement.`;
  const what = it.product==='ride'?'Robotaxi ride':it.product==='charging'?'Supercharging session':it.product==='subscription'?'subscription renewal':'service visit';
  return `Your ${what} payment of ${fmt(it.amount,it.cur)} didn't go through. Tap to pay with any method in your Tesla wallet. Questions about the charge? Reply here and a person will check it.`;
}

// ---- guardrails ----
const LIMITS = { refundAutoUsd:100, writeOffAutoUsd:25 };
function checkAction(a){
  // a: {type, usd, codeKind, attempts, dispute}
  if(a.type==='retry' && a.codeKind && a.codeKind!=='soft') return {allowed:false, needsApproval:false, reason:'Blocked: retrying a hard decline breaks card-network rules.'};
  if(a.type==='retry' && (a.attempts||0)>=MAX_ATTEMPTS) return {allowed:false, needsApproval:false, reason:`Blocked: max ${MAX_ATTEMPTS} attempts per payment.`};
  if(a.type==='send_message' && a.dispute) return {allowed:true, needsApproval:true, reason:'Customer disputed this charge, so a person sends any message.'};
  if(a.type==='refund') return a.usd>LIMITS.refundAutoUsd ? {allowed:true, needsApproval:true, reason:`Refunds over $${LIMITS.refundAutoUsd} need approval.`} : {allowed:true, needsApproval:false, reason:'Within auto-refund limit.'};
  if(a.type==='write_off') return a.usd>LIMITS.writeOffAutoUsd ? {allowed:true, needsApproval:true, reason:`Write-offs over $${LIMITS.writeOffAutoUsd} need approval.`} : {allowed:true, needsApproval:false, reason:'Within auto write-off limit.'};
  return {allowed:true, needsApproval:false, reason:'Allowed.'};
}

// ---- evals: golden cases ----
function runEvals(){
  const C = (o)=>({id:'C-test', tenure:24, onTime:0.85, hasBackup:false, payday:5, ...o});
  const T = (code, o)=>({id:'T-test', ref:'Rtest', code, amount:20, cur:'USD', ...o});
  const first = (t,c)=>recoveryPlan(t,c).plan[0]?.action;
  const naiveFirst = ()=> 'retry_now';
  const L = (o)=>({ref:'R1', amount:50, cur:'USD', rail:'card', ts:AS_OF-5*DAY, collected:true, ...o});
  const S = (o)=>({sid:'S1', ref:'R1', gross:50, fee: round2(50*0.029+0.30), cur:'USD', ...o});
  const brk = (ledger, rows, asOf=AS_OF)=> classifyBreaks(ledger, rows, asOf).breaks.map(b=>b.type);
  const cases = [
    {area:'Recovery', name:'Expired card, no backup: never retry, ask rider to update', test:()=>first(T('54'),C())==='message_update', naive:()=>false},
    {area:'Recovery', name:'Stolen card: no retry and fraud flag raised', test:()=>{const r=recoveryPlan(T('43'),C()); return !r.plan.some(s=>isRetry(s.action)) && r.fraudFlag;}, naive:()=>false},
    {area:'Recovery', name:'Issuer outage (91): retry within the hour first', test:()=>first(T('91'),C())==='retry_1h', naive:()=>false},
    {area:'Recovery', name:'Insufficient funds: wait for payday instead of hammering', test:()=>first(T('51'),C())==='retry_payday', naive:()=>false},
    {area:'Recovery', name:'Soft decline with backup method: use the backup', test:()=>first(T('05'),C({hasBackup:true}))==='switch_backup', naive:()=>false},
    {area:'Recovery', name:'Never more than 3 attempts per payment', test:()=>Object.keys(CODES).every(k=>recoveryPlan(T(k),C({hasBackup:true})).plan.length<=MAX_ATTEMPTS), naive:()=>true},
    {area:'Recovery', name:'At most one retry of the same credential', test:()=>Object.keys(CODES).every(k=>recoveryPlan(T(k),C()).plan.filter(s=>isRetry(s.action)).length<=1), naive:()=>false},
    {area:'Reconciliation', name:'Duplicate settlement is caught', test:()=>brk([L()],[S(),S({sid:'S2'})]).includes('duplicate')},
    {area:'Reconciliation', name:'€0.03 difference is rounding, auto-resolved', test:()=>{const r=classifyBreaks([L({cur:'EUR'})],[S({cur:'EUR',gross:50.03, fee: round2(50*0.029+0.30/1.08)})],AS_OF).breaks[0]; return r&&r.type==='fx_rounding'&&r.autoResolve;}},
    {area:'Reconciliation', name:'€4.00 difference is NOT treated as rounding', test:()=>brk([L({cur:'EUR'})],[S({cur:'EUR',gross:46, fee: round2(50*0.029+0.30/1.08)})]).includes('amount_mismatch')},
    {area:'Reconciliation', name:'No settlement after 5 days is flagged missing', test:()=>brk([L()],[]).includes('missing')},
    {area:'Reconciliation', name:'No settlement after 1 day is still pending, not a break', test:()=>brk([L({ts:AS_OF-DAY})],[]).length===0},
    {area:'Reconciliation', name:'Fee above contracted rate is flagged', test:()=>brk([L()],[S({fee:2.25})]).includes('fee_overcharge')},
    {area:'Reconciliation', name:'Money with no ledger entry is flagged orphan', test:()=>brk([],[S({ref:'K1'})]).includes('orphan')},
    {area:'Reconciliation', name:'Clean match produces no break', test:()=>brk([L()],[S()]).length===0},
    {area:'Guardrails', name:'Refund of $640 needs human approval', test:()=>checkAction({type:'refund',usd:640}).needsApproval},
    {area:'Guardrails', name:'Retry on hard decline is blocked', test:()=>!checkAction({type:'retry',codeKind:'hard_update'}).allowed},
    {area:'Guardrails', name:'Messages on disputed charges go to a person', test:()=>checkAction({type:'send_message',dispute:true}).needsApproval},
  ];
  return cases.map(c=>{ let pass=false, err=null; try{ pass=!!c.test(); }catch(e){ err=String(e); }
    let naive=null; if(c.naive) naive=!!c.naive(); return {area:c.area, name:c.name, pass, naive, err}; });
}

function runAll(opts){
  const data = generate(opts);
  const recovery = simulateRecovery(data);
  const recById = Object.fromEntries(recovery.map(r=>[r.txn,r]));
  const settle = buildSettlements(data, recovery);
  const ledger = data.txns.map(t=>({ref:t.ref, amount:t.amount, cur:t.cur, rail:t.rail, ts:t.ts, market:t.market, collected: t.status==='approved' || !!recById[t.id]?.recovered, txn:t.id}));
  const recon = classifyBreaks(ledger, settle.rows, AS_OF);
  const collections = buildCollections(data, recovery);
  return { data, recovery, recById, settle, recon, collections };
}

if(typeof module!=='undefined') module.exports = { generate, simulateRecovery, recoveryPlan, buildSettlements, classifyBreaks, buildCollections, runEvals, runAll, checkAction, draftMessage, CODES, RAILS, MARKETS, PRODUCTS, ACTIONS, fmt };
