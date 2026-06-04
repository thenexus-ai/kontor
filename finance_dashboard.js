/* =====================================================================
   Finance Dashboard — combined Plan (projection) + Track (expenses)
   Two tabs share one persisted data file (finance_data.json).
   ===================================================================== */
const $=id=>document.getElementById(id);
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#999';}

/* ============================ DATA STORE ============================ */
const STORE_KEY='finance_dashboard_data_v1';
const SCHEMA=1;
let fileHandle=null;            // FileSystemFileHandle when a JSON file is linked
let saveTimer=null;
const fsSupported=('showSaveFilePicker' in window);

// data.expenses[year] = [ {id,name,amount,unit:'month'|'year',months:[12 bools]} ]
// data.income[year]   = net monthly income (number)
// data.projection     = serialized Plan-tab controls
let data={version:SCHEMA, projection:null, income:{}, groupsByYear:{}, expenses:{}};

function uid(){return 'e'+Math.random().toString(36).slice(2,9);}

function setStatus(t,kind){const el=$('fsStatus');if(!el)return;el.textContent=t;
  el.className='fsstat'+(kind?' '+kind:'');}

function saveLocal(){try{localStorage.setItem(STORE_KEY,JSON.stringify(data));}catch(e){}}

async function writeFileNow(){
  if(!fileHandle)return;
  try{const w=await fileHandle.createWritable();
    await w.write(JSON.stringify(data,null,2));await w.close();
    setStatus('saved \u00b7 '+fileHandle.name,'ok');
  }catch(e){setStatus('save failed \u2014 reopen file','bad');}
}

// called on every change: local instantly, file debounced
function persist(){
  saveLocal();
  if(fileHandle){setStatus('saving\u2026');
    clearTimeout(saveTimer);saveTimer=setTimeout(writeFileNow,700);}
}

function applyLoadedData(obj){
  if(!obj||typeof obj!=='object')return;
  const sanitizeGroups=arr=>(Array.isArray(arr)?arr:[]).map(g=>({
    id:g.id||('g'+Math.random().toString(36).slice(2,9)), name:g.name||'Group', collapsed:!!g.collapsed}));
  const gby={};
  if(obj.groupsByYear&&typeof obj.groupsByYear==='object'){
    Object.keys(obj.groupsByYear).forEach(y=>{gby[y]=sanitizeGroups(obj.groupsByYear[y]);});}
  data={version:SCHEMA,
    projection:obj.projection||null,
    income:obj.income||{},
    groupsByYear:gby,
    expenses:obj.expenses||{}};
  // sanitise expense rows
  Object.keys(data.expenses).forEach(y=>{
    data.expenses[y]=(data.expenses[y]||[]).map(e=>({
      id:e.id||uid(), name:e.name||'', amount:+e.amount||0,
      unit:e.unit==='year'?'year':'month', groupId:e.groupId||null,
      months:Array.isArray(e.months)&&e.months.length===12?e.months.map(Boolean):Array(12).fill(true)
    }));
  });
  // migrate legacy global groups: give each existing year its own copy (same ids)
  if(Array.isArray(obj.groups)&&obj.groups.length&&Object.keys(data.groupsByYear).length===0){
    const legacy=sanitizeGroups(obj.groups);
    const years=new Set(Object.keys(data.expenses));years.add(String(new Date().getFullYear()));
    years.forEach(y=>{data.groupsByYear[y]=legacy.map(g=>({id:g.id,name:g.name,collapsed:g.collapsed}));});
  }
  if(data.projection)applyProjection(data.projection);
}

function loadLocal(){
  try{const raw=localStorage.getItem(STORE_KEY);if(raw)applyLoadedData(JSON.parse(raw));}catch(e){}
}

async function openFile(){
  if(!fsSupported)return;
  try{const [h]=await window.showOpenFilePicker({types:[{description:'JSON',accept:{'application/json':['.json']}}]});
    fileHandle=h;const f=await h.getFile();const txt=await f.text();
    applyLoadedData(JSON.parse(txt||'{}'));
    setStatus('linked \u00b7 '+h.name,'ok');
    renderPlanFull();switchYear(currentYear);
  }catch(e){if(e&&e.name!=='AbortError')setStatus('could not open file','bad');}
}

async function newFile(){
  if(!fsSupported)return;
  try{const h=await window.showSaveFilePicker({suggestedName:'finance_data.json',
      types:[{description:'JSON',accept:{'application/json':['.json']}}]});
    fileHandle=h;await writeFileNow();
  }catch(e){if(e&&e.name!=='AbortError')setStatus('could not create file','bad');}
}

function exportFile(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='finance_data.json';a.click();URL.revokeObjectURL(a.href);
}
function importFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{applyLoadedData(JSON.parse(r.result));setStatus('imported','ok');
      renderPlanFull();switchYear(currentYear);}catch(e){setStatus('invalid file','bad');}};
    r.readAsText(f);};
  inp.click();
}

/* ===================================================================
   ===========================  PLAN TAB  ============================
   Projection engine — financial behaviour preserved exactly.
   =================================================================== */
const ABG=0.26375, TF_EQ=0.30, SPB=1000;
var money='real', tax='pre';

function applyTax(eqGain,bdGain,useSpb){let b=Math.max(0,eqGain)*(1-TF_EQ)+Math.max(0,bdGain);
  if(useSpb)b=Math.max(0,b-SPB);return b*ABG;}
function effRate(eqW){return eqW*ABG*(1-TF_EQ)+(1-eqW)*ABG;}

function computeModel(p){
  const mE=Math.pow(1+(p.eqR-p.fee),1/12)-1, mB=Math.pow(1+(p.bdR-p.fee),1/12)-1;
  const accM=Math.max(1,Math.round(p.horizon*12)), decM=Math.max(0,Math.round((p.endAge-p.retAge)*12));
  function strategy(kind){
    let pot=p.start, basis=p.start; const acc=[];
    for(let m=1;m<=accM;m++){
      const eqW = kind==='eq' ? 1.0
        : (accM<=1 ? p.eqGe : p.eqGs+(p.eqGe-p.eqGs)*((m-1)/(accM-1)));
      const r=eqW*mE+(1-eqW)*mB;
      const c=p.contrib*Math.pow(1+p.step,Math.floor((m-1)/12));
      pot=pot*(1+r)+c; basis+=c;
      acc.push({age:p.age+m/12, monthIdx:m, potNom:pot, basisNom:basis, eqW:eqW, phase:0});
    }
    const potAtRet=pot, basisAtRet=basis, eqRet=kind==='eq'?1.0:p.eqGe;
    const rDec=eqRet*mE+(1-eqRet)*mB, eff=effRate(eqRet);
    function run(netReal, record){
      let pt=potAtRet, bs=basisAtRet, ranOut=null; const dec=[];
      for(let m=0;m<decM;m++){const fromNow=accM+m;
        const gf=pt>0?Math.max(0,(pt-bs))/pt:0;
        const wReal=netReal/Math.max(.02,(1-gf*eff)), wNom=wReal*Math.pow(1+p.infl,fromNow/12);
        bs=Math.max(0,bs-wNom*(1-gf)); pt-=wNom;
        if(pt<=0){ranOut=p.retAge+m/12; if(record)dec.push({age:ranOut,monthIdx:fromNow,potNom:0,basisNom:bs,eqW:eqRet,phase:1}); break;}
        pt=pt*(1+rDec);
        if(record)dec.push({age:p.retAge+(m+1)/12,monthIdx:fromNow+1,potNom:pt,basisNom:bs,eqW:eqRet,phase:1});
      }
      return {ranOut, endPot:pt, dec};
    }
    const main=run(p.income,true);
    let lo=0,hi=p.income*6+1000; for(let i=0;i<46;i++){const mid=(lo+hi)/2;(run(mid,false).ranOut===null)?lo=mid:hi=mid;}
    return {acc, dec:main.dec, series:acc.concat(main.dec),
      potAtRet:acc[acc.length-1], ranOut:main.ranOut, endNom:main.endPot, sustainable:lo, eqRet:eqRet};
  }
  let contrib=0, contribReal=0; const paid=[];
  for(let m=1;m<=accM;m++){const c=p.contrib*Math.pow(1+p.step,Math.floor((m-1)/12));
    contrib+=c; const yf=Math.pow(1+p.infl,m/12); contribReal+=c/yf;
    paid.push({monthIdx:m, age:p.age+m/12, nom:p.start+contrib, real:p.start+contribReal});}
  return {p:p, accM:accM, decM:decM, N:accM,
    eq:strategy('eq'), mix:strategy('mix'), paid:paid};
}

function ptValue(pt, p){
  let v=pt.potNom;
  if(tax==='after'){
    const gain=Math.max(0, pt.potNom-pt.basisNom);
    v = pt.potNom - applyTax(gain*pt.eqW, gain*(1-pt.eqW), p.spb);
  }
  if(money==='real') v = v/Math.pow(1+p.infl, pt.monthIdx/12);
  return v;
}
function paidValue(pt){ return money==='real'?pt.real:pt.nom; }
function endRealValue(strat, p){ return strat.endNom/Math.pow(1+p.infl, p.endAge-p.age); }

const FIELDS=[['contrib',0],['step',1],['eqR',1],['bdR',1],['infl',1],['fee',2],
  ['age',0],['ret',0],['end',0],['start',0],['inc',0],['eqGs',0],['eqGe',0]];
function syncNumFromSlider(){FIELDS.forEach(function(f){const el=$(f[0]),n=$(f[0]+'N');
  if(document.activeElement!==n) n.value=(+el.value).toFixed(f[1]);});}
function clampToRange(el,v){const mn=+el.min,mx=+el.max;if(isNaN(v))return +el.value;return Math.min(mx,Math.max(mn,v));}

function P(){
  const age=+$('age').value; let ret=+$('ret').value, end=+$('end').value;
  if(ret<=age)ret=age+1; if(end<=ret)end=ret+1;
  return{contrib:+$('contrib').value, step:+$('step').value/100,
    eqR:+$('eqR').value/100, bdR:+$('bdR').value/100, infl:+$('infl').value/100, fee:+$('fee').value/100,
    spb:$('spb').checked, age:age, retAge:ret, endAge:end, horizon:ret-age, start:+$('start').value,
    income:+$('inc').value, eqGs:+$('eqGs').value/100, eqGe:+$('eqGe').value/100};
}
function eur(x){const s=x<0?'-':'';x=Math.abs(x);
  if(x>=1e6)return s+'\u20ac'+(x/1e6).toFixed(2)+'M';
  if(x>=10000)return s+'\u20ac'+Math.round(x/1000)+'k';
  return s+'\u20ac'+Math.round(x).toLocaleString('de-DE');}
function eurF(x){const s=x<0?'-':'';return s+'\u20ac'+Math.round(Math.abs(x)).toLocaleString('de-DE');}
function milestones(hor){let t=[];for(let y=5;y<hor;y+=5){if(hor-y>=2)t.push(y);}t.push(hor);return t;}

function drawLife(M){
  const p=M.p, cv=$('cvLife'),dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=getChartH();
  if(!W)return;
  cv.style.height=H+'px';
  cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  const a0=p.age,a1=p.endAge,pad={l:54,r:14,t:12,b:24};
  const C_GRID=cssVar('--grid'),C_AXIS=cssVar('--axis'),C_BAND=cssVar('--chartband'),
        C_DASH=cssVar('--chartdash'),C_PAID=cssVar('--chartpaid'),C_BD=cssVar('--bd'),C_EQ=cssVar('--eq');
  let rawMax=0;
  M.eq.series.concat(M.mix.series).forEach(d=>{const v=ptValue(d,p);if(v>rawMax)rawMax=v;});
  M.paid.forEach(d=>{const v=paidValue(d);if(v>rawMax)rawMax=v;});
  rawMax=rawMax||1;
  function niceStep(t){const pw=Math.pow(10,Math.floor(Math.log10(t)));const f=t/pw;
    let nf;if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=2.5)nf=2.5;else if(f<=5)nf=5;else nf=10;return nf*pw;}
  const STEPS=4, step=niceStep(rawMax/STEPS), maxV=step*STEPS;
  const X=a=>pad.l+(W-pad.l-pad.r)*((a-a0)/(a1-a0)), Y=v=>H-pad.b-(H-pad.t-pad.b)*(v/maxV);
  ctx.font='10px "Spline Sans Mono",monospace';
  for(let i=0;i<=STEPS;i++){const v=step*i,y=Y(v);ctx.strokeStyle=C_GRID;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle=C_AXIS;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(eur(v),pad.l-7,y);}
  ctx.textAlign='center';ctx.textBaseline='top';
  for(let a=Math.ceil(a0/10)*10;a<=a1;a+=10){ctx.fillStyle=C_AXIS;ctx.fillText(a,X(a),H-pad.b+5);}
  const xr=X(p.retAge);ctx.fillStyle=C_BAND;ctx.fillRect(xr,pad.t,X(a1)-xr,H-pad.b-pad.t);
  ctx.strokeStyle=C_DASH;ctx.setLineDash([4,4]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(xr,pad.t+4);ctx.lineTo(xr,H-pad.b);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=C_AXIS;ctx.textAlign='center';ctx.fillText('retire @ '+p.retAge,xr,pad.t-4<0?0:pad.t-4);
  ctx.beginPath();M.paid.forEach((d,i)=>{const x=X(d.age),y=Y(paidValue(d));i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.strokeStyle=C_PAID;ctx.lineWidth=1.4;ctx.setLineDash([5,4]);ctx.lineJoin='round';ctx.stroke();ctx.setLineDash([]);
  function curve(strat,color,labelDy){
    ctx.beginPath();strat.series.forEach((d,i)=>{const x=X(d.age),y=Y(ptValue(d,p));i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
    const pk=strat.potAtRet, px=X(pk.age), py=Y(ptValue(pk,p));
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,3.4,0,7);ctx.fill();
    ctx.font='600 10px "Spline Sans Mono",monospace';ctx.fillStyle=color;ctx.textBaseline='bottom';
    ctx.textAlign=px>W-90?'right':'left';ctx.fillText(eur(ptValue(pk,p)),px+(px>W-90?-6:6),py+labelDy);
  }
  curve(M.mix,C_BD,16); curve(M.eq,C_EQ,-5);
}

function labels(M){
  const p=M.p; syncNumFromSlider();
  const mixLabel=Math.round(p.eqGs*100)+'\u2192'+Math.round(p.eqGe*100)+'% eq';
  $('mixLbl').textContent=mixLabel; $('mixLbl2').textContent=mixLabel; $('thMix').textContent=mixLabel;
  $('lifeCap').textContent='age '+p.age+' \u2192 '+p.retAge+' \u2192 '+p.endAge;
  $('retCap').textContent=p.horizon+'y saving \u00b7 '+(p.endAge-p.retAge)+'y retired';
  const mode=(money==='real'?"Today\u2019s \u20ac (real)":'Future \u20ac (nominal)')+' \u00b7 '+(tax==='pre'?'pre-tax':'after tax');
  $('modePill').textContent=mode; $('tblMode').textContent=mode;
}

function render(){
  const p=P();
  if(+$('ret').value!==p.retAge)$('ret').value=p.retAge;
  if(+$('end').value!==p.endAge)$('end').value=p.endAge;
  const M=computeModel(p);
  labels(M);
  drawLife(M);

  $('sPotEq').textContent=eur(ptValue(M.eq.potAtRet,p));
  $('sPotMix').textContent=eur(ptValue(M.mix.potAtRet,p));
  $('sPotEqSafe').textContent='safe '+eurF(M.eq.sustainable)+'/mo';
  $('sPotMixSafe').textContent='safe '+eurF(M.mix.sustainable)+'/mo';

  function lastTxt(strat,idL,idS){if(strat.ranOut===null){$(idL).textContent='age '+p.endAge+'+';$(idS).textContent='survives';}
    else{$(idL).textContent='age '+strat.ranOut.toFixed(0);$(idS).textContent='runs out early';}}
  lastTxt(M.mix,'sLast','sLastSm'); lastTxt(M.eq,'sLastEq','sLastEqSm');
  $('sSafe').textContent=eurF(M.mix.sustainable); $('sSafeEq').textContent=eurF(M.eq.sustainable);
  $('sSafeAge').textContent=p.endAge; $('sSafeAge2').textContent=p.endAge;

  const s=M.mix, v=$('verdict'),ok=s.ranOut===null,close=s.ranOut!==null&&(p.endAge-s.ranOut)<=3;
  v.className='verdict'+(ok?'':(close?' warn':' bad'));
  const safe='\u20ac'+eurF(s.sustainable).replace('\u20ac','')+'/mo', endR=endRealValue(s,p);
  if(ok){$('vIcon').innerHTML='&#10003;';$('vTitle').textContent='On track \u2014 money outlasts your plan';
    $('vBody').innerHTML='With the mix, \u20ac'+p.income.toLocaleString('de-DE')+'/mo lasts past '+p.endAge+', leaving ~<b>'+eur(endR)+'</b> (today\u2019s \u20ac). Safe ceiling <b>'+safe+'</b>.';}
  else if(close){$('vIcon').innerHTML='&#9888;';$('vTitle').textContent='Almost \u2014 a small gap';
    $('vBody').innerHTML='Mix runs out ~age <b>'+s.ranOut.toFixed(0)+'</b>, '+(p.endAge-s.ranOut).toFixed(0)+'y short. Trim to <b>'+safe+'</b> or save more.';}
  else{$('vIcon').innerHTML='&#10007;';$('vTitle').textContent='Shortfall \u2014 needs adjusting';
    $('vBody').innerHTML='Mix runs out ~age <b>'+s.ranOut.toFixed(0)+'</b>. Sustainable ~<b>'+safe+'</b> \u2014 save more, retire later, or spend less.';}

  const tb=$('tbody');tb.innerHTML='';
  milestones(p.horizon).forEach(yr=>{const i=Math.min(M.N-1,yr*12-1);
    const eqV=ptValue(M.eq.acc[i],p), mxV=ptValue(M.mix.acc[i],p), pd=paidValue(M.paid[i]);
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+yr+'</td><td>'+(p.age+yr)+'</td><td>'+eurF(pd)+'</td><td class="eqv">'+eurF(eqV)+'</td><td class="bdv">'+eurF(mxV)+'</td><td>'+eurF(eqV-pd)+'</td>';
    tb.appendChild(tr);});
  $('note0').innerHTML='Both strategies from \u20ac'+p.contrib.toLocaleString('de-DE')+'/mo over '+p.horizon+' saving years, seeded with your \u20ac'+p.start.toLocaleString('de-DE')+' starting balance. Shown in <b>'+
    (money==='real'?"today\u2019s purchasing power":'future nominal \u20ac')+'</b>, '+
    (tax==='pre'?'before tax.':'after German tax: gain \u00d7 (1\u221230% equity exemption) \u00d7 26.375%'+(p.spb?', minus \u20ac1k allowance':'')+'. Tax hits gains only, never your contributions or starting balance.')+
    ' Chart, cards and table all read one calculation, so the final row always equals the pot-at-retirement cards.';

  persistProjection();
}

// serialize / restore the Plan controls so they live in the data file too
function persistProjection(){
  const o={fields:{},money:money,tax:tax,spb:$('spb').checked};
  FIELDS.forEach(f=>o.fields[f[0]]=+$(f[0]).value);
  data.projection=o; persist();
}
function applyProjection(o){
  if(!o)return;
  if(o.fields)FIELDS.forEach(f=>{if(o.fields[f[0]]!=null)$(f[0]).value=o.fields[f[0]];});
  if(o.money){money=o.money;segSet('segMoney',money);}
  if(o.tax){tax=o.tax;segSet('segTax',tax);}
  if(typeof o.spb==='boolean')$('spb').checked=o.spb;
}
function segSet(segId,val){const seg=$(segId);if(!seg)return;
  Array.from(seg.children).forEach(b=>b.classList.toggle('on',b.dataset.v===val));}

function renderPlanFull(){render();}

/* ===================================================================
   ==========================  TRACK TAB  ============================
   Expense tracker — per-year fixed costs with month-level granularity
   and monthly <-> yearly auto-scaling.
   =================================================================== */
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MINI  =['J','F','M','A','M','J','J','A','S','O','N','D'];
const THIS_YEAR=new Date().getFullYear();
let currentYear=THIS_YEAR;

function yearList(y){const e=Object.keys(data.expenses).map(Number);
  const inc=Object.keys(data.income).map(Number);
  const all=e.concat(inc,[THIS_YEAR,y]);
  const lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);
  const out=[];for(let i=lo;i<=hi;i++)out.push(i);return out;}

function getRows(y){if(!data.expenses[y])data.expenses[y]=[];return data.expenses[y];}
function monthlyRate(e){return e.unit==='year'?(e.amount||0)/12:(e.amount||0);}
function activeCount(e){return e.months.filter(Boolean).length;}
function annualActual(e){return monthlyRate(e)*activeCount(e);}    // what it really costs this year
function annualFull(e){return monthlyRate(e)*12;}                  // 12-month equivalent

function perMonthTotals(y){const t=Array(12).fill(0);
  getRows(y).forEach(e=>{const r=monthlyRate(e);e.months.forEach((on,m)=>{if(on)t[m]+=r;});});return t;}

function autoGrow(ta){ta.style.height='auto';ta.style.height=(ta.scrollHeight)+'px';}

/* ----- groups (per-year; definitions share an id across years for future cross-year rename) ----- */
const GROUP_TINTS=['#1f6f54','#c2702c','#5b7fa6','#9c6b8e','#6f8f4a','#b5462f'];
function newGid(){return 'g'+Math.random().toString(36).slice(2,9);}
function ensureGroups(y){if(!data.groupsByYear)data.groupsByYear={};if(!Array.isArray(data.groupsByYear[y]))data.groupsByYear[y]=[];return data.groupsByYear[y];}
function getGroups(y){return ensureGroups(y);}
function groupById(y,id){return ensureGroups(y).find(g=>g.id===id)||null;}
function addGroup(y,name){const g={id:newGid(),name:name||'New group',collapsed:false};ensureGroups(y).push(g);return g;}
function deleteGroup(y,id){const arr=ensureGroups(y);const i=arr.findIndex(g=>g.id===id);if(i>-1)arr.splice(i,1);
  // only this year's expenses lose the assignment — other years are untouched
  (data.expenses[y]||[]).forEach(e=>{if(e.groupId===id)e.groupId=null;});}
function groupAnnual(y,gid){return getRows(y).filter(e=>(e.groupId||null)===gid).reduce((s,e)=>s+annualActual(e),0);}

/* ----- drag & drop: move/reorder expenses across groups ----- */
function clearDropMarks(){const tb=$('expBody');if(!tb)return;
  Array.from(tb.querySelectorAll('.drop-before,.drop-after,.drop-into'))
    .forEach(el=>el.classList.remove('drop-before','drop-after','drop-into'));}
function dropExpense(dragId, targetGid, refId, placeAfter){
  if(!dragId)return;
  if(dragId===refId){renderExpenseTable();return;}
  const rows=getRows(currentYear);
  const di=rows.findIndex(e=>e.id===dragId); if(di<0)return;
  const [item]=rows.splice(di,1);
  item.groupId=targetGid||null;
  if(refId){
    const ri=rows.findIndex(e=>e.id===refId);
    if(ri<0)rows.push(item); else rows.splice(placeAfter?ri+1:ri,0,item);
  }else{ // dropped on a group header -> append to end of that group
    let lastIdx=-1; rows.forEach((e,i)=>{if((e.groupId||null)===(targetGid||null))lastIdx=i;});
    if(lastIdx>=0)rows.splice(lastIdx+1,0,item); else rows.push(item);
  }
  renderExpenseTable();refreshSummary();drawMonths();persist();
}

/* ----- one expense row ----- */
function buildExpenseRow(e, rows){
  const tr=document.createElement('tr'); tr.className='exprow'; tr.dataset.id=e.id;
  // name (wrapping, auto-growing textarea so long names stay readable)
  const tdN=document.createElement('td');tdN.className='namecol';
  const inN=document.createElement('textarea');inN.className='ein name';inN.rows=1;
  inN.value=e.name;inN.placeholder='e.g. Rent';
  inN.addEventListener('input',()=>{e.name=inN.value;autoGrow(inN);refreshDerived();persist();});
  tdN.appendChild(inN);
  // amount + unit toggle
  const tdA=document.createElement('td');tdA.className='amtcell';
  const inA=document.createElement('input');inA.className='ein amt';inA.inputMode='decimal';
  inA.value=e.amount?String(e.amount).replace('.',','):'';inA.placeholder='0';
  inA.addEventListener('input',()=>{const v=parseFloat(inA.value.replace(',','.'));
    e.amount=isNaN(v)?0:v;updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();persist();});
  tdA.appendChild(inA);
  const sel=document.createElement('select');sel.className='unitsel';
  sel.innerHTML='<option value="month">\u20ac / mo</option><option value="year">\u20ac / yr</option>';
  sel.value=e.unit;
  sel.addEventListener('change',()=>{e.unit=sel.value;updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();persist();});
  tdA.appendChild(sel);
  tr.appendChild(tdN);tr.appendChild(tdA);
  // months grid
  const tdM=document.createElement('td');tdM.className='mcell';
  const grid=document.createElement('div');grid.className='mgrid';
  e.months.forEach((on,m)=>{const c=document.createElement('button');
    c.className='msq'+(on?' on':'');c.textContent=MINI[m];c.title=MONTHS[m];
    c.addEventListener('click',()=>{e.months[m]=!e.months[m];c.classList.toggle('on',e.months[m]);
      updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();drawMonths();persist();});
    grid.appendChild(c);});
  const allBtn=document.createElement('button');allBtn.className='msall';allBtn.textContent='all';
  allBtn.title='Toggle all months';
  allBtn.addEventListener('click',()=>{const fill=activeCount(e)<12;e.months=Array(12).fill(fill);
    Array.from(grid.querySelectorAll('.msq')).forEach(sq=>sq.classList.toggle('on',fill));
    updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();drawMonths();persist();});
  grid.appendChild(allBtn);
  tdM.appendChild(grid);tr.appendChild(tdM);
  // derived: monthly + annual
  const tdMo=document.createElement('td');tdMo.className='dvm';tr.appendChild(tdMo);
  const tdYr=document.createElement('td');tdYr.className='dvy';tr.appendChild(tdYr);
  // actions: drag handle (move between groups) + delete
  const tdX=document.createElement('td');tdX.className='actcell';
  const grip=document.createElement('button');grip.className='draghandle';grip.innerHTML='&#8942;';
  grip.title='Drag to move to another group';grip.setAttribute('aria-label','Drag to reorder or regroup');
  let armed=false;
  grip.addEventListener('mousedown',()=>{armed=true;});
  grip.addEventListener('mouseup',()=>{armed=false;});
  tr.draggable=true; tr.dataset.gid=e.groupId||'';
  tr.addEventListener('dragstart',ev=>{
    if(!armed){ev.preventDefault();return;}
    ev.dataTransfer.setData('text/plain',e.id);ev.dataTransfer.effectAllowed='move';
    window._dragId=e.id; tr.classList.add('dragging');});
  tr.addEventListener('dragend',()=>{armed=false;window._dragId=null;tr.classList.remove('dragging');clearDropMarks();});
  tr.addEventListener('dragover',ev=>{if(!window._dragId)return;ev.preventDefault();ev.dataTransfer.dropEffect='move';
    clearDropMarks();const r=tr.getBoundingClientRect?tr.getBoundingClientRect():{top:0,height:1};
    const after=(ev.clientY-r.top)>r.height/2; tr.classList.add(after?'drop-after':'drop-before');});
  tr.addEventListener('dragleave',()=>tr.classList.remove('drop-before','drop-after'));
  tr.addEventListener('drop',ev=>{ev.preventDefault();const r=tr.getBoundingClientRect?tr.getBoundingClientRect():{top:0,height:1};
    const after=(ev.clientY-r.top)>r.height/2; clearDropMarks();
    dropExpense(window._dragId, e.groupId||null, e.id, after);});
  const del=document.createElement('button');del.className='delx';del.innerHTML='&times;';del.title='Delete';
  del.addEventListener('click',()=>{const i=rows.indexOf(e);if(i>-1)rows.splice(i,1);
    renderExpenseTable();refreshSummary();drawMonths();persist();});
  const actwrap=document.createElement('div');actwrap.className='actwrap';
  actwrap.appendChild(grip);actwrap.appendChild(del);
  tdX.appendChild(actwrap);tr.appendChild(tdX);
  updateRowDerived(tr,e);
  return tr;
}

/* ----- whole-table (re)build, grouped into collapsible sections ----- */
function renderExpenseTable(){
  const y=currentYear, groups=getGroups(y), rows=getRows(y), tb=$('expBody'); tb.innerHTML='';
  const buckets=groups.map((g,i)=>({g:g,tint:GROUP_TINTS[i%GROUP_TINTS.length]}));
  buckets.push({g:null,tint:'var(--line)'}); // Ungrouped always last (keeps an add button)
  buckets.forEach(b=>{
    const gid=b.g?b.g.id:null;
    const members=rows.filter(e=>(e.groupId||null)===gid);
    const collapsed=b.g?!!b.g.collapsed:false;
    // ---- group header row: real cells aligned to the data columns ----
    const hr=document.createElement('tr');hr.className='grouprow';hr.dataset.gid=gid||'';
    // left cell spans Name+Amount+Active-months
    const cL=document.createElement('td');cL.colSpan=3;cL.style.borderLeft='3px solid '+b.tint;
    const wrap=document.createElement('div');wrap.className='ghead';
    const car=document.createElement('button');car.className='gcaret';car.textContent=collapsed?'\u25B8':'\u25BE';
    if(b.g)car.addEventListener('click',()=>{b.g.collapsed=!b.g.collapsed;renderExpenseTable();persist();});
    else car.style.visibility='hidden';
    wrap.appendChild(car);
    if(b.g){const gn=document.createElement('input');gn.className='gname';gn.value=b.g.name;
      gn.addEventListener('input',()=>{b.g.name=gn.value;persist();});
      gn.addEventListener('change',()=>renderExpenseTable());
      wrap.appendChild(gn);}
    else{const gn=document.createElement('span');gn.className='gname ung';gn.textContent='Ungrouped';wrap.appendChild(gn);}
    const cnt=document.createElement('span');cnt.className='gcount';cnt.textContent=members.length;wrap.appendChild(cnt);
    const add=document.createElement('button');add.className='gadd';add.textContent='+ add';add.title='Add an expense to this group';
    add.addEventListener('click',()=>{const ne={id:uid(),name:'',amount:0,unit:'month',months:Array(12).fill(true),groupId:gid};
      rows.push(ne);if(b.g)b.g.collapsed=false;renderExpenseTable();persist();
      const r=tb.querySelector('tr[data-id="'+ne.id+'"]');if(r){const t=r.querySelector('.name');if(t)t.focus();}});
    wrap.appendChild(add);
    cL.appendChild(wrap);
    // /mo and /yr subtotal cells — aligned under the data columns
    const cMo=document.createElement('td');cMo.className='dvm gsubcell';
    const cYr=document.createElement('td');cYr.className='dvy gsubcell';
    // actions cell — delete group (named only)
    const cX=document.createElement('td');cX.className='ghact';
    if(b.g){const dg=document.createElement('button');dg.className='gdel';dg.innerHTML='&times;';dg.title='Delete group for this year (its expenses move to Ungrouped; other years keep the group)';
      dg.addEventListener('click',()=>{deleteGroup(currentYear,b.g.id);renderExpenseTable();persist();});
      cX.appendChild(dg);}
    hr.appendChild(cL);hr.appendChild(cMo);hr.appendChild(cYr);hr.appendChild(cX);
    hr.addEventListener('dragover',ev=>{if(!window._dragId)return;ev.preventDefault();ev.dataTransfer.dropEffect='move';
      clearDropMarks();hr.classList.add('drop-into');});
    hr.addEventListener('dragleave',()=>hr.classList.remove('drop-into'));
    hr.addEventListener('drop',ev=>{ev.preventDefault();clearDropMarks();dropExpense(window._dragId,gid,null,false);});
    // hide the Ungrouped header when there are groups AND no ungrouped members (avoid clutter)
    if(!b.g&&members.length===0&&groups.length>0)hr.classList.add('ghost');
    tb.appendChild(hr);
    if(!collapsed)members.forEach(e=>tb.appendChild(buildExpenseRow(e,rows)));
  });
  tb.querySelectorAll('textarea.name').forEach(autoGrow);
  refreshGroupSubtotals();refreshSummary();drawMonths();
}

// refresh just the per-group subtotal cells (no rebuild)
function refreshGroupSubtotals(){
  const y=currentYear, tb=$('expBody');
  Array.from(tb.querySelectorAll('tr.grouprow')).forEach(hr=>{
    const gid=hr.dataset.gid||null;const ann=groupAnnual(y,gid);
    const mo=hr.querySelector('.dvm'),yr=hr.querySelector('.dvy');
    if(mo)mo.textContent=eurF(ann/12);
    if(yr)yr.textContent=eurF(ann);
  });
}

function updateRowDerived(tr,e){
  tr.querySelector('.dvm').textContent=eurF(monthlyRate(e));
  const ac=activeCount(e), full=annualFull(e), act=annualActual(e);
  const yc=tr.querySelector('.dvy');
  yc.innerHTML=eurF(act)+(ac<12&&ac>0?'<span class="dvfull">of '+eurF(full)+'</span>':'');
}

/* ----- light recompute on every keystroke (no table rebuild) ----- */
function refreshDerived(){refreshSummary();}
function refreshSummary(){
  const y=currentYear, rows=getRows(y);
  let annual=0;rows.forEach(e=>annual+=annualActual(e));
  const monthlyAvg=annual/12;
  $('sumAnnual').textContent=eurF(annual);
  $('sumMonthly').textContent=eurF(monthlyAvg);
  $('sumCount').textContent=rows.length+(rows.length===1?' item':' items');
  // bridge: income - fixed costs
  const inc=+ ($('incomeN').value.replace? $('incomeN').value.replace(',','.'):$('incomeN').value) ||0;
  const free=inc-monthlyAvg;
  $('sumFree').textContent=eurF(free);
  $('sumFree').className='big '+(free<0?'neg':'pos');
  $('freeNote').textContent= inc>0
    ? (free>=0?'left to save / invest each month':'over budget \u2014 spending exceeds income')
    : 'enter your net monthly income above';
  $('pushSave').disabled=!(inc>0&&free>0);
}

/* ----- monthly breakdown bar chart (matches Plan canvas style) ----- */
function drawMonths(){
  const cv=$('cvMonths');if(!cv)return;const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=210;
  if(!W)return;
  cv.style.height=H+'px';
  cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  const t=perMonthTotals(currentYear),pad={l:50,r:12,t:12,b:22};
  const C_GRID=cssVar('--grid'),C_AXIS=cssVar('--axis'),C_BD=cssVar('--bd');
  let rawMax=Math.max.apply(null,t.concat([1]));
  function niceStep(v){const pw=Math.pow(10,Math.floor(Math.log10(v)));const f=v/pw;
    let nf;if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=2.5)nf=2.5;else if(f<=5)nf=5;else nf=10;return nf*pw;}
  const STEPS=4,step=niceStep(rawMax/STEPS),maxV=step*STEPS||1;
  const Y=v=>H-pad.b-(H-pad.t-pad.b)*(v/maxV);
  ctx.font='10px "Spline Sans Mono",monospace';
  for(let i=0;i<=STEPS;i++){const v=step*i,y=Y(v);ctx.strokeStyle=C_GRID;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle=C_AXIS;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(eur(v),pad.l-6,y);}
  const innerW=W-pad.l-pad.r, slot=innerW/12, bw=slot*0.62;
  ctx.textAlign='center';ctx.textBaseline='top';
  t.forEach((v,m)=>{const cx=pad.l+slot*m+slot/2, h=(H-pad.t-pad.b)*(v/maxV), yTop=Y(v);
    ctx.fillStyle=C_BD;ctx.beginPath();
    const x=cx-bw/2,yy=yTop,wd=bw,hh=H-pad.b-yTop,rr=Math.min(3,wd/2,hh);
    if(hh>0){ctx.moveTo(x,yy+hh);ctx.lineTo(x,yy+rr);ctx.quadraticCurveTo(x,yy,x+rr,yy);
      ctx.lineTo(x+wd-rr,yy);ctx.quadraticCurveTo(x+wd,yy,x+wd,yy+rr);ctx.lineTo(x+wd,yy+hh);ctx.closePath();ctx.fill();}
    ctx.fillStyle=C_AXIS;ctx.fillText(MINI[m],cx,H-pad.b+5);});
}

/* ----- year navigation + carry forward ----- */
function buildYearStrip(){
  const sel=$('yearSel');sel.innerHTML='';
  yearList(currentYear).forEach(y=>{const o=document.createElement('option');o.value=y;
    o.textContent=y+(y===THIS_YEAR?'  \u00b7 now':'');sel.appendChild(o);});
  sel.value=currentYear;
}
function switchYear(y){
  currentYear=y;
  buildYearStrip();
  $('incomeN').value=data.income[y]!=null?String(data.income[y]).replace('.',','):'';
  $('yearTag').textContent= y<THIS_YEAR?'past':(y>THIS_YEAR?'planned':'current');
  $('yearTag').className='ytag '+(y<THIS_YEAR?'past':(y>THIS_YEAR?'future':'now'));
  renderExpenseTable();
}
function carryForward(){
  const target=currentYear+1;
  const src=getRows(currentYear);
  if(!data.expenses[target])data.expenses[target]=[];
  // copy this year's group definitions (preserve ids for cross-year lineage)
  data.groupsByYear[target]=getGroups(currentYear).map(g=>({id:g.id,name:g.name,collapsed:g.collapsed}));
  // copy (deep) rows, keep income too if target empty
  data.expenses[target]=src.map(e=>({id:uid(),name:e.name,amount:e.amount,unit:e.unit,groupId:e.groupId||null,months:e.months.slice()}));
  if(data.income[target]==null&&data.income[currentYear]!=null)data.income[target]=data.income[currentYear];
  persist();switchYear(target);
}

/* ===================== SETTINGS (appearance, browser-local only) ===================== */
const SETTINGS_KEY='fd_settings', SETTINGS_VER=1;
const FONT_PAIRS={
  mono:{label:'Spline Sans Mono (default)', display:'"Spline Sans Mono",monospace', body:'"Spline Sans Mono",monospace', mono:'"Spline Sans Mono",monospace'},
  fraunces:{label:'Fraunces \u00b7 Spline Sans', display:'"Fraunces",serif', body:'"Spline Sans",sans-serif', mono:'"Spline Sans Mono",monospace'},
  sans:{label:'Spline Sans \u2014 clean sans', display:'"Spline Sans",sans-serif', body:'"Spline Sans",sans-serif', mono:'"Spline Sans Mono",monospace'},
  system:{label:'System serif \u00b7 system sans', display:'Georgia,"Times New Roman",serif', body:'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', mono:'ui-monospace,Menlo,Consolas,monospace'}
};
const DEFAULT_SETTINGS={version:SETTINGS_VER, themeMode:'auto', font:'mono', density:'comfortable',
  accents:{light:{eq:'#A923A5',bd:'#5D45D9'}, dark:{eq:'#A923A5',bd:'#5D45D9'}}};
function isHex(s){return typeof s==='string'&&/^#[0-9a-fA-F]{6}$/.test(s);}
function cloneDefaults(){return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));}
let settings=cloneDefaults();
function loadSettings(){
  try{const raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(!raw||typeof raw!=='object')return;
    if(['light','dark','auto'].indexOf(raw.themeMode)>=0)settings.themeMode=raw.themeMode;
    if(FONT_PAIRS[raw.font])settings.font=raw.font;
    if(['comfortable','compact'].indexOf(raw.density)>=0)settings.density=raw.density;
    ['light','dark'].forEach(t=>{if(raw.accents&&raw.accents[t]){
      if(isHex(raw.accents[t].eq))settings.accents[t].eq=raw.accents[t].eq;
      if(isHex(raw.accents[t].bd))settings.accents[t].bd=raw.accents[t].bd;}});
  }catch(e){}
}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(e){}}

function shade(hex,amt){ // amt>0 mix toward white, <0 toward black
  if(!isHex(hex))return hex;const n=parseInt(hex.slice(1),16);let r=n>>16,g=(n>>8)&255,b=n&255;
  const target=amt>0?255:0,k=Math.abs(amt);
  const mix=t=>Math.round(t+(target-t)*k);
  r=mix(r);g=mix(g);b=mix(b);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function systemPrefersDark(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){return false;}}
function resolvedTheme(){return settings.themeMode==='auto'?(systemPrefersDark()?'dark':'light'):settings.themeMode;}
function applyAccents(){
  const t=resolvedTheme(),a=settings.accents[t]||DEFAULT_SETTINGS.accents[t];
  const ds=document.documentElement.style;
  ds.setProperty('--eq',a.eq);ds.setProperty('--eq-soft',shade(a.eq,0.14));
  ds.setProperty('--bd',a.bd);ds.setProperty('--good',a.eq);ds.setProperty('--warn',a.bd);
}
function applyThemeVisual(){
  const t=resolvedTheme();
  if(t==='dark')document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
  const btn=$('btnTheme');if(btn)btn.innerHTML=(t==='dark')?'\u2600 Light':'\u263D Dark';
  applyAccents(); // accents depend on the resolved theme, so re-apply after the theme attr
}
function applyFont(){const p=FONT_PAIRS[settings.font]||FONT_PAIRS.fraunces;const ds=document.documentElement.style;
  ds.setProperty('--f-display',p.display);ds.setProperty('--f-body',p.body);ds.setProperty('--f-mono',p.mono);}
function applyDensity(){document.documentElement.setAttribute('data-density',settings.density==='compact'?'compact':'comfortable');}
function repaintCanvases(){if($('tabPlan').style.display!=='none')render();else drawMonths();}
function applySettings(){applyFont();applyDensity();applyThemeVisual();repaintCanvases();syncSettingsUI();}

// quick header toggle: flips between explicit light/dark (leaves "auto" behind intentionally)
function toggleTheme(){settings.themeMode=resolvedTheme()==='dark'?'light':'dark';saveSettings();applyThemeVisual();repaintCanvases();syncSettingsUI();}

/* settings panel open/close + control wiring */
function openSettings(){const o=$('setOvl');if(!o)return;o.hidden=false;requestAnimationFrame(()=>o.classList.add('open'));syncSettingsUI();}
function closeSettings(){const o=$('setOvl');if(!o)return;o.classList.remove('open');setTimeout(()=>{o.hidden=true;},220);}
function syncSettingsUI(){
  const seg=$('setTheme');if(seg)Array.from(seg.children).forEach(b=>b.classList.toggle('on',b.dataset.v===settings.themeMode));
  const den=$('setDensity');if(den)Array.from(den.children).forEach(b=>b.classList.toggle('on',b.dataset.v===settings.density));
  const f=$('setFont');if(f)f.value=settings.font;
  const map={accLightEq:['light','eq'],accLightBd:['light','bd'],accDarkEq:['dark','eq'],accDarkBd:['dark','bd']};
  Object.keys(map).forEach(id=>{const el=$(id);if(el)el.value=settings.accents[map[id][0]][map[id][1]];});
}
function buildFontOptions(){const f=$('setFont');if(!f)return;f.innerHTML='';
  Object.keys(FONT_PAIRS).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=FONT_PAIRS[k].label;f.appendChild(o);});}
function wireSettings(){
  const gear=$('btnSettings');if(gear)gear.addEventListener('click',openSettings);
  const cl=$('setClose');if(cl)cl.addEventListener('click',closeSettings);
  const ovl=$('setOvl');if(ovl)ovl.addEventListener('click',ev=>{if(ev.target===ovl)closeSettings();});
  const seg=$('setTheme');if(seg)seg.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?ev.target.dataset.v:null;
    if(!v)return;settings.themeMode=v;saveSettings();applyThemeVisual();repaintCanvases();syncSettingsUI();});
  const den=$('setDensity');if(den)den.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?ev.target.dataset.v:null;
    if(!v)return;settings.density=v;saveSettings();applyDensity();repaintCanvases();syncSettingsUI();});
  buildFontOptions();
  const f=$('setFont');if(f)f.addEventListener('change',()=>{settings.font=f.value;saveSettings();applyFont();repaintCanvases();});
  const map={accLightEq:['light','eq'],accLightBd:['light','bd'],accDarkEq:['dark','eq'],accDarkBd:['dark','bd']};
  Object.keys(map).forEach(id=>{const el=$(id);if(!el)return;
    el.addEventListener('input',()=>{const v=el.value;if(!isHex(v))return;settings.accents[map[id][0]][map[id][1]]=v;
      saveSettings();applyAccents();repaintCanvases();});});
  const rst=$('setReset');if(rst)rst.addEventListener('click',()=>{settings=cloneDefaults();
    try{localStorage.removeItem(SETTINGS_KEY);}catch(e){}applySettings();});
  // react to system theme changes when in auto mode
  try{const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
    if(mq){const h=()=>{if(settings.themeMode==='auto'){applyThemeVisual();repaintCanvases();}};
      if(mq.addEventListener)mq.addEventListener('change',h);else if(mq.addListener)mq.addListener(h);}}catch(e){}
}

/* ============================== TABS =============================== */
function showTab(which){
  const plan=which==='plan';
  $('tabPlan').style.display=plan?'':'none';
  $('tabTrack').style.display=plan?'none':'';
  $('btnPlan').classList.toggle('on',plan);
  $('btnTrack').classList.toggle('on',!plan);
  if(typeof applySplits==='function')applySplits(); // now-visible main has a real width to clamp against
  if(plan)render(); else {renderExpenseTable();}
}

/* ===================== LAYOUT: tabs, splitter, chart height, tile swap ===================== */
const TABORDER_KEY='fd_taborder', SPLIT_KEY='fd_splits', ORDER_KEY='fd_order', CHARTH_KEY='fd_charth';
// per-main minimum widths (px) for left and right tiles — prevents the right tile overflowing
const LAYOUT_MIN={mainPlan:[340,300], mainTrack:[300,920]};
const CHARTH_MIN=180, CHARTH_MAX=560, CHARTH_DEFAULT=300;
let splits={};try{splits=JSON.parse(localStorage.getItem(SPLIT_KEY)||'{}')||{};}catch(e){splits={};}
let tileOrder={};try{tileOrder=JSON.parse(localStorage.getItem(ORDER_KEY)||'{}')||{};}catch(e){tileOrder={};}
let chartH=CHARTH_DEFAULT;try{const c=+localStorage.getItem(CHARTH_KEY);if(c>=CHARTH_MIN&&c<=CHARTH_MAX)chartH=c;}catch(e){}
function getChartH(){return chartH;}

/* ---- tabs ---- */
function saveTabOrder(){const bar=$('tabbar');if(!bar)return;
  try{localStorage.setItem(TABORDER_KEY,JSON.stringify(Array.from(bar.children).map(b=>b.id)));}catch(e){}}
function applyTabOrder(){const bar=$('tabbar');if(!bar)return;
  try{const o=JSON.parse(localStorage.getItem(TABORDER_KEY)||'null');
    if(Array.isArray(o))o.forEach(id=>{const el=$(id);if(el)bar.appendChild(el);});}catch(e){}}
function wireTabDnD(){
  const bar=$('tabbar');if(!bar)return;const btns=()=>Array.from(bar.children);
  btns().forEach(b=>{
    b.draggable=true;
    b.addEventListener('dragstart',ev=>{ev.dataTransfer.setData('text/plain',b.id);ev.dataTransfer.effectAllowed='move';
      window._tabDrag=b.id;b.classList.add('tabdrag');});
    b.addEventListener('dragend',()=>{window._tabDrag=null;b.classList.remove('tabdrag');btns().forEach(x=>x.classList.remove('tabover'));});
    b.addEventListener('dragover',ev=>{if(!window._tabDrag)return;ev.preventDefault();ev.dataTransfer.dropEffect='move';
      btns().forEach(x=>x.classList.remove('tabover'));if(b.id!==window._tabDrag)b.classList.add('tabover');});
    b.addEventListener('dragleave',()=>b.classList.remove('tabover'));
    b.addEventListener('drop',ev=>{ev.preventDefault();b.classList.remove('tabover');
      const dragId=window._tabDrag;if(!dragId||dragId===b.id)return;const dragEl=$(dragId);if(!dragEl)return;
      const r=b.getBoundingClientRect?b.getBoundingClientRect():{left:0,width:1};
      const after=(ev.clientX-r.left)>r.width/2;
      if(after){if(b.nextSibling)bar.insertBefore(dragEl,b.nextSibling);else bar.appendChild(dragEl);}
      else bar.insertBefore(dragEl,b);
      saveTabOrder();});
  });
}

/* ---- horizontal splitter with content-aware clamp (Option B) ---- */
function clampLeftPct(id, pct, mainW){
  const mins=LAYOUT_MIN[id]||[200,200];
  if(!mainW||mainW<=0)return pct;
  const minPct=(mins[0]/mainW)*100;
  const maxPct=((mainW-14-mins[1])/mainW)*100;
  if(maxPct<minPct)return Math.max(0,Math.min(100,(minPct+maxPct)/2)); // tiny screens: best effort
  return Math.max(minPct,Math.min(maxPct,pct));
}
const DEFAULT_LEFT={mainPlan:61, mainTrack:48};
function applySplits(){['mainPlan','mainTrack'].forEach(id=>{const m=$(id);if(!m)return;
  const base=(splits[id]!=null)?splits[id]:DEFAULT_LEFT[id];
  const w=m.getBoundingClientRect?m.getBoundingClientRect().width:0;
  if(!w)return; // hidden tab: applied when it becomes visible
  m.style.setProperty('--leftw',clampLeftPct(id,base,w)+'%');});}
function reclampSplits(){applySplits();}
function wireSplitter(gutter){
  const main=gutter.parentNode;if(!main)return;const id=main.id;let dragging=false,raf=0;
  function redraw(){if($('tabPlan').style.display!=='none')render();else drawMonths();}
  gutter.addEventListener('pointerdown',ev=>{dragging=true;gutter.classList.add('dragging');
    if(gutter.setPointerCapture)gutter.setPointerCapture(ev.pointerId);ev.preventDefault();});
  gutter.addEventListener('pointermove',ev=>{if(!dragging)return;
    const r=main.getBoundingClientRect();let pct=((ev.clientX-r.left)/r.width)*100;
    pct=clampLeftPct(id,pct,r.width);main.style.setProperty('--leftw',pct+'%');splits[id]=Math.round(pct*10)/10;
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;redraw();});});
  function end(ev){if(!dragging)return;dragging=false;gutter.classList.remove('dragging');
    if(gutter.releasePointerCapture&&ev&&ev.pointerId!=null)try{gutter.releasePointerCapture(ev.pointerId);}catch(e){}
    try{localStorage.setItem(SPLIT_KEY,JSON.stringify(splits));}catch(e){}redraw();}
  gutter.addEventListener('pointerup',end);gutter.addEventListener('pointercancel',end);
  gutter.addEventListener('dblclick',()=>{delete splits[id];main.style.removeProperty('--leftw');
    try{localStorage.setItem(SPLIT_KEY,JSON.stringify(splits));}catch(e){}redraw();});
}

/* ---- vertical divider: chart height (Plan tab) ---- */
function wireChartResizer(vg){
  let dragging=false,startY=0,startH=0,raf=0;
  vg.addEventListener('pointerdown',ev=>{dragging=true;startY=ev.clientY;startH=chartH;vg.classList.add('dragging');
    if(vg.setPointerCapture)vg.setPointerCapture(ev.pointerId);ev.preventDefault();});
  vg.addEventListener('pointermove',ev=>{if(!dragging)return;
    chartH=Math.max(CHARTH_MIN,Math.min(CHARTH_MAX,startH+(ev.clientY-startY)));
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;if($('tabPlan').style.display!=='none')drawLife(computeModel(P()));});});
  function end(ev){if(!dragging)return;dragging=false;vg.classList.remove('dragging');
    if(vg.releasePointerCapture&&ev&&ev.pointerId!=null)try{vg.releasePointerCapture(ev.pointerId);}catch(e){}
    try{localStorage.setItem(CHARTH_KEY,String(Math.round(chartH)));}catch(e){}
    if($('tabPlan').style.display!=='none')render();}
  vg.addEventListener('pointerup',end);vg.addEventListener('pointercancel',end);
  vg.addEventListener('dblclick',()=>{chartH=CHARTH_DEFAULT;try{localStorage.setItem(CHARTH_KEY,String(CHARTH_DEFAULT));}catch(e){}
    if($('tabPlan').style.display!=='none')render();});
}

/* ---- tile swapping (drag a panel by its header grip onto the other) ---- */
const TILE_PAIRS={mainPlan:['planChart','planControls'], mainTrack:['trackSummary','trackExpenses']};
function mainOf(panelId){return panelId==='planChart'||panelId==='planControls'?'mainPlan':'mainTrack';}
function applyTileOrder(){Object.keys(TILE_PAIRS).forEach(mid=>{const order=tileOrder[mid];if(!Array.isArray(order))return;
  const m=$(mid);if(!m)return;const g=m.querySelector?m.querySelector('.gutter'):null;
  const first=$(order[0]),second=$(order[1]);if(!first||!second||!g)return;
  m.insertBefore(first,g);m.appendChild(second);});}
function saveTileOrder(mid){const m=$(mid);if(!m)return;
  const ids=(m.children||[]).map(c=>c.id).filter(x=>x&&x!=='');
  tileOrder[mid]=ids.filter(x=>TILE_PAIRS[mid].indexOf(x)>=0);
  try{localStorage.setItem(ORDER_KEY,JSON.stringify(tileOrder));}catch(e){}}
function swapTiles(mid){const m=$(mid);if(!m)return;const g=m.querySelector('.gutter');
  const ids=TILE_PAIRS[mid];const a=$(ids[0]),b=$(ids[1]);if(!a||!b||!g)return;
  // current first child among the pair:
  const firstIsA=(m.children.indexOf?m.children.indexOf(a):Array.from(m.children).indexOf(a))<
                 (m.children.indexOf?m.children.indexOf(b):Array.from(m.children).indexOf(b));
  if(firstIsA){m.insertBefore(b,g);m.appendChild(a);}else{m.insertBefore(a,g);m.appendChild(b);}
  saveTileOrder(mid);
  if($('tabPlan').style.display!=='none')render();else drawMonths();}
function wireTileSwap(){
  ['planChart','planControls','trackSummary','trackExpenses'].forEach(pid=>{
    const panel=$(pid);if(!panel)return;const grip=panel.querySelector?panel.querySelector('.tilegrip'):null;
    let armed=false;
    if(grip){grip.addEventListener('mousedown',()=>{armed=true;});grip.addEventListener('mouseup',()=>{armed=false;});}
    panel.draggable=true;
    panel.addEventListener('dragstart',ev=>{if(!armed){ev.preventDefault();return;}
      ev.dataTransfer.setData('text/plain',pid);ev.dataTransfer.effectAllowed='move';window._tileDrag=pid;panel.classList.add('tiledrag');});
    panel.addEventListener('dragend',()=>{armed=false;window._tileDrag=null;panel.classList.remove('tiledrag');
      ['planChart','planControls','trackSummary','trackExpenses'].forEach(q=>{const e2=$(q);if(e2)e2.classList.remove('tiletarget');});});
    panel.addEventListener('dragover',ev=>{const d=window._tileDrag;if(!d||d===pid)return;
      if(mainOf(d)!==mainOf(pid))return; // only swap within the same row
      ev.preventDefault();ev.dataTransfer.dropEffect='move';panel.classList.add('tiletarget');});
    panel.addEventListener('dragleave',()=>panel.classList.remove('tiletarget'));
    panel.addEventListener('drop',ev=>{const d=window._tileDrag;panel.classList.remove('tiletarget');
      if(!d||d===pid||mainOf(d)!==mainOf(pid))return;ev.preventDefault();swapTiles(mainOf(pid));});
  });
}

function wireLayout(){
  applyTabOrder();wireTabDnD();
  applyTileOrder();wireTileSwap();
  applySplits();
  (document.querySelectorAll('.gutter')||[]).forEach(wireSplitter);
  (document.querySelectorAll('.vgutter')||[]).forEach(wireChartResizer);
}

/* ============================== WIRING ============================= */
function wire(){
  // Plan controls (behaviour unchanged)
  document.querySelectorAll('#tabPlan input[type=range]').forEach(el=>el.addEventListener('input',render));
  $('spb').addEventListener('change',render);
  FIELDS.forEach(function(f){const slider=$(f[0]),num=$(f[0]+'N');
    num.addEventListener('input',function(){let v=parseFloat(num.value.replace(',','.'));
      if(!isNaN(v)){v=clampToRange(slider,v);slider.value=v;render();}});
    num.addEventListener('blur',function(){let v=parseFloat(num.value.replace(',','.'));
      v=isNaN(v)?+slider.value:clampToRange(slider,v);slider.value=v;num.value=v.toFixed(f[1]);render();});
    num.addEventListener('keydown',function(e){if(e.key==='Enter')num.blur();});
  });
  $('segMoney').addEventListener('click',function(e){if(e.target.dataset.v){money=e.target.dataset.v;
    Array.from(e.currentTarget.children).forEach(b=>b.classList.toggle('on',b===e.target));render();}});
  $('segTax').addEventListener('click',function(e){if(e.target.dataset.v){tax=e.target.dataset.v;
    Array.from(e.currentTarget.children).forEach(b=>b.classList.toggle('on',b===e.target));render();}});
  $('match').addEventListener('click',function(){const M=computeModel(P());$('inc').value=Math.round(M.mix.sustainable/100)*100;render();});

  // Tabs
  $('btnPlan').addEventListener('click',()=>showTab('plan'));
  $('btnTrack').addEventListener('click',()=>showTab('track'));

  // Theme + settings
  $('btnTheme').addEventListener('click',toggleTheme);
  wireSettings();

  // Track: year nav
  $('yearSel').addEventListener('change',e=>switchYear(+e.target.value));
  $('yPrev').addEventListener('click',()=>switchYear(currentYear-1));
  $('yNext').addEventListener('click',()=>switchYear(currentYear+1));
  $('carry').addEventListener('click',carryForward);

  // Track: add expense
  $('addExp').addEventListener('click',()=>{const ne={id:uid(),name:'',amount:0,unit:'month',groupId:null,months:Array(12).fill(true)};
    getRows(currentYear).push(ne);renderExpenseTable();persist();
    const r=$('expBody').querySelector('tr[data-id="'+ne.id+'"]');if(r){const t=r.querySelector('.name');if(t)t.focus();}});
  $('addGroup').addEventListener('click',()=>{const g=addGroup(currentYear,'New group');renderExpenseTable();persist();
    const hr=$('expBody').querySelector('tr.grouprow[data-gid="'+g.id+'"]');if(hr){const n=hr.querySelector('.gname');if(n){n.focus();if(n.select)n.select();}}});

  // Track: income field + bridge button
  $('incomeN').addEventListener('input',()=>{const v=parseFloat($('incomeN').value.replace(',','.'));
    data.income[currentYear]=isNaN(v)?0:v;refreshSummary();persist();});
  $('pushSave').addEventListener('click',()=>{
    const inc=parseFloat($('incomeN').value.replace(',','.'))||0;
    const annual=getRows(currentYear).reduce((s,e)=>s+annualActual(e),0);
    const free=Math.max(0,Math.round((inc-annual/12)/50)*50);
    const sl=$('contrib');sl.value=Math.min(+sl.max,Math.max(+sl.min,free));render();
    showTab('plan');
  });

  // Data file controls
  if(fsSupported){
    $('btnOpen').addEventListener('click',openFile);
    $('btnNew').addEventListener('click',newFile);
    $('btnExport').style.display='none';$('btnImport').style.display='none';
  }else{
    $('btnOpen').style.display='none';$('btnNew').style.display='none';
    $('btnExport').addEventListener('click',exportFile);
    $('btnImport').addEventListener('click',importFile);
  }

  window.addEventListener('resize',()=>{reclampSplits();if($('tabPlan').style.display!=='none')render();else drawMonths();});
}

/* ============================== INIT ============================== */
function init(){
  wire();
  loadSettings();              // appearance prefs (browser-local)
  applyFont();applyDensity();applyThemeVisual();  // paint look before first render
  loadLocal();                 // restore last session (also applies projection)
  // fresh start: seed a few common German fixed-cost categories into the current year
  const anyGroups=Object.keys(data.groupsByYear||{}).some(y=>(data.groupsByYear[y]||[]).length>0);
  const anyExp=Object.keys(data.expenses).some(y=>(data.expenses[y]||[]).length>0);
  if(!anyGroups&&!anyExp)['Housing','Subscriptions','Insurance'].forEach(n=>addGroup(THIS_YEAR,n));
  currentYear=THIS_YEAR;
  buildYearStrip();
  wireLayout();                // tab drag-reorder + resizable splitter
  render();                    // Plan visible first
  switchYear(currentYear);     // prime Track tab data
  showTab('track');
}
document.addEventListener('DOMContentLoaded',init);
