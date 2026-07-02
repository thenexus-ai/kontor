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
// data.securities     = {startBalance, startMonth:'YYYY-MM', ledger:{'YYYY-MM':contribAmount, ...}}
//                       contributions-only running total; no speculative gains modelled
let data={version:SCHEMA, projection:null, income:{}, groupsByYear:{}, expenses:{}, securities:null};

function uid(){return 'e'+Math.random().toString(36).slice(2,9);}

function setStatus(t,kind){const el=$('fsStatus');if(!el)return;el.textContent=t;
  el.className='fsstat'+(kind?' '+kind:'');}

function saveLocal(){FDStore.write(data);}   // localStorage (instant) + IndexedDB (durable), via storage layer

async function writeFileNow(){
  if(!fileHandle)return;
  try{const w=await fileHandle.createWritable();
    await w.write(JSON.stringify(data,null,2));await w.close();
    setStatus(t('status.saved',{name:fileHandle.name}),'ok');
  }catch(e){setStatus(t('status.saveFailed'),'bad');}
}

// called on every change: local instantly, file debounced
function persist(){
  saveLocal();
  if(fileHandle){setStatus(t('status.saving'));
    clearTimeout(saveTimer);saveTimer=setTimeout(writeFileNow,700);}
}

// coerce to a finite number, else the fallback — rejects NaN, Infinity, "1e400", non-numeric strings
function numF(x,def){const v=+x;return Number.isFinite(v)?v:(def||0);}
// a year key from an untrusted import is only accepted if it's a plain integer in a sane range
function validYearKey(k){const ty=new Date().getFullYear(),n=Number(k);
  return Number.isInteger(n)&&n>=1900&&n<=ty+100;}

function sanitizeSecurities(s){
  if(!s||typeof s!=='object')return null;
  const ymOk=k=>{const m=/^(\d{4})-(\d{2})$/.exec(k);return !!m && +m[2]>=1 && +m[2]<=12;};
  const out={startBalance:numF(s.startBalance,0),
    startMonth:(typeof s.startMonth==='string'&&ymOk(s.startMonth))?s.startMonth:null,
    ledger:{}, values:{}, notes:{}, benchmark:null};
  if(s.ledger&&typeof s.ledger==='object'){
    Object.keys(s.ledger).forEach(k=>{if(ymOk(k)){const v=+s.ledger[k];if(Number.isFinite(v))out.ledger[k]=v;}});}
  if(s.values&&typeof s.values==='object'){
    Object.keys(s.values).forEach(k=>{if(ymOk(k)){const v=+s.values[k];if(Number.isFinite(v)&&v>=0)out.values[k]=v;}});}
  if(s.notes&&typeof s.notes==='object'){
    Object.keys(s.notes).forEach(k=>{if(ymOk(k)&&typeof s.notes[k]==='string')out.notes[k]=s.notes[k].slice(0,140);});}
  const b=s.benchmark;
  if(b&&typeof b==='object'&&ymOk(b.anchorMonth)){
    out.benchmark={setMonth:ymOk(b.setMonth)?b.setMonth:b.anchorMonth, anchorMonth:b.anchorMonth,
      startBalance:numF(b.startBalance,0), contrib:numF(b.contrib,0), step:numF(b.step,0),
      eqR:numF(b.eqR,0), bdR:numF(b.bdR,0), fee:numF(b.fee,0), infl:(b.infl!=null?numF(b.infl,0):0),
      eqGs:(b.eqGs!=null?numF(b.eqGs,1):1), eqGe:(b.eqGe!=null?numF(b.eqGe,1):1),
      horizonM:(Number.isFinite(+b.horizonM)&&+b.horizonM>0)?Math.min(3600,+b.horizonM):360};
  }
  return out;
}

function applyLoadedData(obj){
  if(!obj||typeof obj!=='object')return;
  const sanitizeGroups=arr=>(Array.isArray(arr)?arr:[]).map(g=>({
    id:g.id||('g'+Math.random().toString(36).slice(2,9)), name:g.name||'Group', collapsed:!!g.collapsed}));
  // All three maps are keyed by year. Untrusted imports get their keys range-checked
  // (a bogus key like "9999999999" would otherwise blow up yearList) and their buckets
  // shape-checked (a non-array bucket would throw on .map and brick the whole load).
  const gby={}, inc={}, exp={};
  if(obj.groupsByYear&&typeof obj.groupsByYear==='object'){
    Object.keys(obj.groupsByYear).forEach(y=>{if(validYearKey(y))gby[y]=sanitizeGroups(obj.groupsByYear[y]);});}
  if(obj.income&&typeof obj.income==='object'){
    Object.keys(obj.income).forEach(y=>{if(validYearKey(y)){const v=+obj.income[y];if(Number.isFinite(v))inc[y]=v;}});}
  if(obj.expenses&&typeof obj.expenses==='object'){
    Object.keys(obj.expenses).forEach(y=>{if(validYearKey(y))exp[y]=Array.isArray(obj.expenses[y])?obj.expenses[y]:[];});}
  data={version:SCHEMA,
    projection:obj.projection||null,
    income:inc,
    groupsByYear:gby,
    expenses:exp,
    securities:sanitizeSecurities(obj.securities)};
  // sanitise expense rows (each row may also be malformed/non-object from a crafted file)
  Object.keys(data.expenses).forEach(y=>{
    data.expenses[y]=data.expenses[y].map(e=>{e=(e&&typeof e==='object')?e:{};return {
      id:e.id||uid(), name:typeof e.name==='string'?e.name.slice(0,200):'', amount:numF(e.amount,0),
      unit:e.unit==='year'?'year':'month', groupId:e.groupId||null,
      months:Array.isArray(e.months)&&e.months.length===12?e.months.map(Boolean):Array(12).fill(true)
    };});
  });
  // migrate legacy global groups: give each existing year its own copy (same ids)
  if(Array.isArray(obj.groups)&&obj.groups.length&&Object.keys(data.groupsByYear).length===0){
    const legacy=sanitizeGroups(obj.groups);
    const years=new Set(Object.keys(data.expenses));years.add(String(new Date().getFullYear()));
    years.forEach(y=>{data.groupsByYear[y]=legacy.map(g=>({id:g.id,name:g.name,collapsed:g.collapsed}));});
  }
  if(data.projection)applyProjection(data.projection);
  reconcileSecurities();
}

function loadLocal(){
  const o=FDStore.readSync();if(o)applyLoadedData(o);   // instant synchronous boot from localStorage
}

// Durable rehydrate: after the sync boot, mark storage persistent and — if
// localStorage was evicted (iOS ITP) but IndexedDB still holds a copy — restore it.
function hydrateDurable(){
  FDStore.requestPersistence();
  if(localStorage.getItem(STORE_KEY)) return;   // localStorage present → already loaded; IDB just mirrors it
  if(fileHandle) return;                         // a linked file is the source of truth; don't override
  FDStore.readDurable().then(o=>{
    if(o && !localStorage.getItem(STORE_KEY) && !fileHandle){
      applyLoadedData(o); saveLocal(); afterLoadRefresh();
    }
  });
}

async function openFile(){
  if(!fsSupported)return;
  try{const [h]=await window.showOpenFilePicker({types:[{description:'JSON',accept:{'application/json':['.json']}}]});
    const f=await h.getFile();const txt=await f.text();
    let obj;try{obj=JSON.parse(txt||'{}');}catch(e){setStatus(t('status.invalidFile'),'bad');return;}
    if(!looksLikeKontor(obj)&&!confirm(t('confirm.notKontor')))return;
    snapshotBeforeReplace();
    fileHandle=h;applyLoadedData(obj);
    setStatus(t('status.linked',{name:h.name}),'ok');
    await rememberHandle(h);updateStartupBanner();
    afterLoadRefresh();offerUndo();
  }catch(e){if(e&&e.name!=='AbortError')setStatus(t('status.openFailed'),'bad');}
}

async function newFile(){
  if(!fsSupported)return;
  try{const h=await window.showSaveFilePicker({suggestedName:dataFileName(),
      types:[{description:'JSON',accept:{'application/json':['.json']}}]});
    fileHandle=h;await rememberHandle(h);await writeFileNow();
  }catch(e){if(e&&e.name!=='AbortError')setStatus(t('status.createFailed'),'bad');}
}

/* ---- remember the last-used file handle so we can offer a 1-click reconnect ---- */
const IDB_DB='fd_fs', IDB_STORE='handles', IDB_KEY='last';
function idbOpen(){return new Promise((res,rej)=>{try{const r=indexedDB.open(IDB_DB,1);
  r.onupgradeneeded=()=>{r.result.createObjectStore(IDB_STORE);};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}catch(e){rej(e);}});}
async function rememberHandle(h){try{const db=await idbOpen();await new Promise((res,rej)=>{
  const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(h,IDB_KEY);
  tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(e){}}
async function loadRememberedHandle(){try{const db=await idbOpen();return await new Promise((res)=>{
  const tx=db.transaction(IDB_STORE,'readonly');const rq=tx.objectStore(IDB_STORE).get(IDB_KEY);
  rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>res(null);});}catch(e){return null;}}
async function forgetHandle(){try{const db=await idbOpen();await new Promise((res)=>{
  const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(IDB_KEY);
  tx.oncomplete=res;tx.onerror=res;});}catch(e){}}

// On launch: if a handle was remembered and permission is still granted, relink silently.
// Otherwise just show the informational banner (changes are manual import/export now).
async function tryReconnectOnStartup(){
  if(!fsSupported){updateStartupBanner();return;}
  const h=await loadRememberedHandle();
  if(!h){updateStartupBanner();return;}
  try{
    const q=h.queryPermission?await h.queryPermission({mode:'readwrite'}):'granted';
    if(q==='granted'){await relinkHandle(h);return;}
  }catch(e){}
  updateStartupBanner(); // can't silently relink without a gesture — show the manual-save reminder
}
async function relinkHandle(h){
  try{const f=await h.getFile();const txt=await f.text();
    fileHandle=h;applyLoadedData(JSON.parse(txt||'{}'));
    setStatus(t('status.linked',{name:h.name}),'ok');updateStartupBanner();
    afterLoadRefresh();
  }catch(e){setStatus(t('status.reopenFailed'),'bad');}
}
function updateStartupBanner(){
  const b=$('startupBar');if(!b)return;
  if(fileHandle){b.hidden=true;return;}
  b.hidden=false;
  const msg=$('startupMsg');
  // honest, reassuring copy (data IS durable in IndexedDB); link clause only when the File System Access API exists
  if(msg)msg.textContent=(typeof t==='function')?t(fsSupported?'banner.persist':'banner.persist.nolink')
    :'Your data is saved on this device. Export anytime for a backup.';
}
// after loading data from any source, refresh the tab the user is actually looking at
function afterLoadRefresh(){
  ensureSecurities();reconcileSecurities();
  buildYearStrip();
  if($('tabPlan').style.display!=='none')render();
  else if($('tabInvest')&&$('tabInvest').style.display!=='none')renderInvest();
  else switchYear(currentYear);
}

function exportFile(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=dataFileName();a.click();URL.revokeObjectURL(a.href);
}
function importFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{let obj;try{obj=JSON.parse(r.result);}catch(e){setStatus(t('status.invalidFile'),'bad');return;}
      if(!looksLikeKontor(obj)&&!confirm(t('confirm.notKontor')))return;   // soft warn, don't hard-block
      snapshotBeforeReplace();                                            // one-step Undo before we overwrite
      applyLoadedData(obj);setStatus(t('status.imported'),'ok');
      updateStartupBanner();afterLoadRefresh();offerUndo();};
    r.readAsText(f);};
  inp.click();
}

/* ===================================================================
   ===========================  PLAN TAB  ============================
   Projection engine — financial behaviour preserved exactly.
   =================================================================== */
const ABG=0.26375, TF_EQ=0.30, SPB=1000;
var money='real', tax='pre';

/* The Forecast verdict only makes a personal claim once the user has actually set BOTH their
   income and a monthly-saving amount — otherwise it would assert "On track" from factory-default
   sliders. We track that with two persisted flags (saving is also set by Track's "Send to plan"). */
let _fcTouch={income:false, saving:false};
try{const _r=JSON.parse(localStorage.getItem('kontor_fc_touched')||'null');
  if(_r&&typeof _r==='object'){_fcTouch.income=!!_r.income;_fcTouch.saving=!!_r.saving;}}catch(e){}
function markForecastTouched(which){if(!_fcTouch[which]){_fcTouch[which]=true;
  try{localStorage.setItem('kontor_fc_touched',JSON.stringify(_fcTouch));}catch(e){}}}
function forecastReady(){return _fcTouch.income&&_fcTouch.saving;}

function applyTax(eqGain,bdGain){let b=Math.max(0,eqGain)*(1-TF_EQ)+Math.max(0,bdGain);return b*ABG;}
function effRate(eqW){return eqW*ABG*(1-TF_EQ)+(1-eqW)*ABG;}

function computeModel(p){
  const mE=Math.pow(1+(p.eqR-p.fee),1/12)-1, mB=Math.pow(1+(p.bdR-p.fee),1/12)-1;
  const accM=Math.max(1,Math.round(p.horizon*12)), decM=Math.max(0,Math.round((p.endAge-p.retAge)*12));
  function strategy(kind){
    let pot=p.start, basis=p.start, harvested=0; const acc=[];
    for(let m=1;m<=accM;m++){
      const eqW = kind==='eq' ? 1.0
        : (accM<=1 ? p.eqGe : p.eqGs+(p.eqGe-p.eqGs)*((m-1)/(accM-1)));
      const r=eqW*mE+(1-eqW)*mB;
      const c=p.contrib*Math.pow(1+p.step,Math.floor((m-1)/12));
      pot=pot*(1+r)+c; basis+=c;
      // Freistellungsauftrag: at each year-end, realise up to the €1k Sparerpauschbetrag of
      // gains tax-free and reinvest the proceeds into the same holding. The pot is unchanged
      // (sell + immediate rebuy) but the cost basis steps up by the harvested amount — so over
      // the horizon up to SPB×years of gains is shifted permanently out of the tax base, both
      // for the after-tax pot and for the lower gain-fraction carried into retirement.
      if(p.spb && m%12===0){const g=pot-basis; if(g>0){const h=Math.min(SPB,g); basis+=h; harvested+=h;}}
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
      potAtRet:acc[acc.length-1], ranOut:main.ranOut, endNom:main.endPot, sustainable:lo, eqRet:eqRet,
      // lifetime tax avoided by harvesting the allowance every year: the gains shifted out of the
      // tax base, taxed at this strategy's blended rate (equity Teilfreistellung already applied).
      harvested:harvested, taxSaved:harvested*eff};
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
    v = pt.potNom - applyTax(gain*pt.eqW, gain*(1-pt.eqW));
  }
  if(money==='real') v = v/Math.pow(1+p.infl, pt.monthIdx/12);
  return v;
}
function paidValue(pt){ return money==='real'?pt.real:pt.nom; }
function endRealValue(strat, p){ return strat.endNom/Math.pow(1+p.infl, p.endAge-p.age); }

const FIELDS=[['contrib',0],['step',1],['eqR',1],['bdR',1],['infl',1],['fee',2],
  ['age',0],['ret',0],['end',0],['inc',0],['eqGs',0],['eqGe',0]];
function syncNumFromSlider(){FIELDS.forEach(function(f){const el=$(f[0]),n=$(f[0]+'N');
  if(document.activeElement!==n) n.value=(+el.value).toFixed(f[1]);});}
function clampToRange(el,v){const mn=+el.min,mx=+el.max;if(isNaN(v))return +el.value;return Math.min(mx,Math.max(mn,v));}

function P(){
  const age=+$('age').value; let ret=+$('ret').value, end=+$('end').value;
  if(ret<=age)ret=age+1; if(end<=ret)end=ret+1;
  const startEl=$('start');
  const startBal=data.securities?securitiesCurrentBalance():(startEl?+startEl.value||0:0);
  return{contrib:+$('contrib').value, step:+$('step').value/100,
    eqR:+$('eqR').value/100, bdR:+$('bdR').value/100, infl:+$('infl').value/100, fee:+$('fee').value/100,
    spb:$('spb').checked, age:age, retAge:ret, endAge:end, horizon:ret-age, start:startBal,
    income:+$('inc').value, eqGs:+$('eqGs').value/100, eqGe:+$('eqGe').value/100};
}
function eur(x){const s=x<0?'-':'';x=Math.abs(x);
  if(x>=1e6)return s+'\u20ac'+(x/1e6).toFixed(2)+'M';
  if(x>=10000)return s+'\u20ac'+Math.round(x/1000)+'k';
  return s+'\u20ac'+Math.round(x).toLocaleString('de-DE');}
function eurF(x){const s=x<0?'-':'';return s+'\u20ac'+Math.round(Math.abs(x)).toLocaleString('de-DE');}
// de-DE-aware: strips thousands dots, treats comma as decimal separator
// "2.500"->2500, "2.500,50"->2500.5, "1.234,5"->1234.5, "12,5"->12.5, "1000"->1000
function parseNum(str){
  if(typeof str==='number')return str;
  if(str==null)return NaN;
  let s=String(str).trim();if(!s)return NaN;
  if(s.indexOf(',')>=0){s=s.replace(/\./g,'').replace(',','.');}      // comma present => dots are grouping
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)){s=s.replace(/\./g,'');}        // pure grouping pattern, e.g. 2.500 / 1.234.567
  // otherwise a lone dot is treated as a decimal point (e.g. "2.5")
  return parseFloat(s);
}
function milestones(hor){let t=[];for(let y=5;y<hor;y+=5){if(hor-y>=2)t.push(y);}t.push(hor);return t;}

/* ----- hover crosshair: a single vertical guide line + a snapped dot at every series it crosses ----- */
const GAIN_GREEN='#15a34a', LOSS_RED='#dc2626';   // fixed, palette-independent (item 14)
let changeOffset=0;          // months the market-change window is scrolled back (item 13)
let invLedExpanded=false;    // ledger shows last 12 by default (item 15)
let _lifeGeom=null, _monthGeom=null, _hoverMonth=-1, lastLifeM=null;
function gY(geom,v){return geom.H-geom.pad.b-(geom.H-geom.pad.t-geom.pad.b)*(v/(geom.maxV||1));}
// dots: [{y, color}] all sharing the vertical-line x; vx clamped to the plot area
function drawCrosshair(ovId,geom,vx,dots){
  const ov=$(ovId);if(!ov)return;
  const dpr=window.devicePixelRatio||1;
  if(!geom){const c=ov.getContext('2d');if(ov.width)c.clearRect(0,0,ov.width,ov.height);return;}
  const W=geom.W,H=geom.H,pad=geom.pad;
  ov.style.height=H+'px';
  if(ov.width!==Math.round(W*dpr)||ov.height!==Math.round(H*dpr)){ov.width=Math.round(W*dpr);ov.height=Math.round(H*dpr);}
  const ctx=ov.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  if(vx==null||vx<pad.l-0.5||vx>W-pad.r+0.5)return;
  ctx.save();
  // vertical dotted guide line
  ctx.strokeStyle=cssVar('--axis');ctx.globalAlpha=0.6;ctx.lineWidth=1;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(vx,pad.t);ctx.lineTo(vx,H-pad.b);ctx.stroke();
  ctx.setLineDash([]);ctx.globalAlpha=1;
  // snapped dots where the line meets each series
  (dots||[]).forEach(d=>{if(d.y==null||isNaN(d.y))return;const y=Math.max(pad.t,Math.min(H-pad.b,d.y));
    ctx.fillStyle=cssVar('--card');ctx.beginPath();ctx.arc(vx,y,4.2,0,7);ctx.fill();   // ring for contrast
    ctx.fillStyle=d.color||cssVar('--ink');ctx.beginPath();ctx.arc(vx,y,2.9,0,7);ctx.fill();});
  ctx.restore();
}
function lifeTipAt(age){
  if(!lastLifeM)return null;
  const M=lastLifeM,p=M.p;
  const near=arr=>{let best=arr[0],bd=Infinity;for(let i=0;i<arr.length;i++){const dd=Math.abs(arr[i].age-age);if(dd<bd){bd=dd;best=arr[i];}}return best;};
  return {age:Math.round(age), retired:age>=p.retAge,
    eq:ptValue(near(M.eq.series),p), mix:ptValue(near(M.mix.series),p), paid:paidValue(near(M.paid))};
}
function wireLifeHover(){
  const cv=$('cvLife'),tip=$('lifeTip');if(!cv)return;
  function clear(){drawCrosshair('cvLifeOv',_lifeGeom,null,null);if(tip)tip.hidden=true;}
  cv.addEventListener('mousemove',ev=>{
    const r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top,g=_lifeGeom;
    if(!g||!tip||mx<g.pad.l||mx>g.W-g.pad.r||my<g.pad.t||my>g.H-g.pad.b){clear();return;}
    const age=g.a0+(g.a1-g.a0)*((mx-g.pad.l)/(g.W-g.pad.l-g.pad.r));
    const d=lifeTipAt(age);if(!d){clear();return;}
    const dots=[{y:gY(g,d.eq),color:cssVar('--eq')},{y:gY(g,d.mix),color:cssVar('--bd')}];
    if(!d.retired)dots.push({y:gY(g,d.paid),color:cssVar('--chartpaid')}); // paid-in line ends at retirement
    drawCrosshair('cvLifeOv',g,mx,dots);
    const mixName=$('mixLbl')?$('mixLbl').textContent:'mix';
    tip.innerHTML='<div class="mtip-h">'+t('tip.age')+' <b>'+d.age+'</b> \u00b7 '+(d.retired?t('tip.retired'):t('tip.saving'))+'</div>'+
      '<div class="mtip-rows">'+
      '<div class="mtip-row"><span><i class="ltdot" style="background:var(--eq)"></i>'+t('fc.legend.equity')+'</span><span>'+eur(d.eq)+'</span></div>'+
      '<div class="mtip-row"><span><i class="ltdot" style="background:var(--bd)"></i>'+escapeHTML(mixName)+'</span><span>'+eur(d.mix)+'</span></div>'+
      '<div class="mtip-row"><span><i class="ltdot dash"></i>'+t('fc.legend.paidin')+'</span><span>'+eur(d.paid)+'</span></div>'+
      '</div>';
    tip.hidden=false;
    const host=tip.offsetParent?tip.offsetParent.getBoundingClientRect():r;
    let left=ev.clientX-host.left+14, top=ev.clientY-host.top+14;
    if(left+180>host.width)left=ev.clientX-host.left-180-14;
    if(left<4)left=4;
    tip.style.left=left+'px';tip.style.top=top+'px';
  });
  cv.addEventListener('mouseleave',clear);
}

function wireInvestHover(){
  const cv=$('cvInvestValue'),tip=$('invTip');if(!cv)return;
  function clear(){drawCrosshair('cvInvestValueOv',_investGeom,null,null);if(tip)tip.hidden=true;}
  cv.addEventListener('mousemove',ev=>{
    const r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top,g=_investGeom;
    if(!g||!tip||g.n<1||mx<g.pad.l||mx>g.W-g.pad.r||my<g.pad.t||my>g.H-g.pad.b){clear();return;}
    let i=Math.round((mx-g.pad.l)/(g.W-g.pad.l-g.pad.r)*(g.n-1));i=Math.max(0,Math.min(g.n-1,i));
    const d=g.ser[i];if(!d){clear();return;}
    const vx=g.X(i), dots=[{y:gY(g,d.invested),color:cssVar('--chartpaid')}];
    if(d.value!=null)dots.push({y:gY(g,d.value),color:cssVar('--eq')});
    if(d.bench!=null)dots.push({y:gY(g,d.bench),color:cssVar('--bd')});
    drawCrosshair('cvInvestValueOv',g,vx,dots);
    let html='<div class="mtip-h">'+ymLabel(d.ym)+'</div><div class="mtip-rows">'+
      '<div class="mtip-row"><span><i class="ltdot" style="background:var(--eq)"></i>'+t('tip.value')+'</span><span>'+(d.value!=null?eur(d.value):'\u2014')+'</span></div>'+
      '<div class="mtip-row"><span><i class="ltdot dash"></i>'+t('tip.invested')+'</span><span>'+eur(d.invested)+'</span></div>';
    if(d.bench!=null)html+='<div class="mtip-row"><span><i class="ltdot" style="background:var(--bd)"></i>'+t('tip.benchmark')+'</span><span>'+eur(d.bench)+'</span></div>';
    html+='</div>';
    tip.innerHTML=html;tip.hidden=false;
    const host=tip.offsetParent?tip.offsetParent.getBoundingClientRect():r;
    let left=ev.clientX-host.left+14, top=ev.clientY-host.top+14;
    if(left+180>host.width)left=ev.clientX-host.left-180-14;if(left<4)left=4;
    tip.style.left=left+'px';tip.style.top=top+'px';
  });
  cv.addEventListener('mouseleave',clear);
}

function drawLife(M){
  const p=M.p, cv=$('cvLife'),dpr=window.devicePixelRatio||1,W=cv.clientWidth;
  const host=cv.parentNode; let H=host&&host.clientHeight?host.clientHeight:getChartH();
  H=Math.max(140,H);
  if(!W)return;
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
  _lifeGeom={W:W,H:H,pad:pad,maxV:maxV,a0:a0,a1:a1};
  lastLifeM=M;
}

function labels(M){
  const p=M.p; syncNumFromSlider();
  const mixLabel=Math.round(p.eqGs*100)+'\u2192'+Math.round(p.eqGe*100)+'% '+t('fc.eqShort');
  $('mixLbl').textContent=mixLabel; $('mixLbl2').textContent=mixLabel; $('thMix').textContent=mixLabel;
  $('lifeCap').textContent=t('fc.lifeCap',{a:p.age,r:p.retAge,e:p.endAge});
  $('retCap').textContent=t('fc.retCap',{s:p.horizon,d:(p.endAge-p.retAge)});
  const mode=(money==='real'?t('fc.real'):t('fc.nominal'))+' \u00b7 '+(tax==='pre'?t('fc.mode.pretax'):t('fc.mode.aftertax'));
  $('modePill').textContent=mode; $('tblMode').textContent=mode;
}

/* ===================================================================
   ===================  SECURITIES ACCOUNT (Plan tab)  ===============
   Contributions-only running balance, stored per month. No market gains.
   start point = startBalance at startMonth; each elapsed month adds the
   monthly-saving contribution (per-month manual override via ledger).
   =================================================================== */
function ym(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}
function thisYM(){return ym(new Date());}
function ymToParts(s){const m=/^(\d{4})-(\d{2})$/.exec(s);return m?{y:+m[1],mo:+m[2]-1}:null;}
function ymAdd(s,n){const p=ymToParts(s);if(!p)return s;const d=new Date(p.y,p.mo+n,1);return ym(d);}
function ymCompare(a,b){return a<b?-1:(a>b?1:0);}
function ymLabel(s){const p=ymToParts(s);if(!p)return s;
  return MONTHS[p.mo]+' \u2019'+('0'+(p.y%100)).slice(-2);}

function ensureSecurities(){
  if(!data.securities)data.securities={startBalance:0,startMonth:thisYM(),ledger:{},values:{},notes:{},benchmark:null};
  if(!data.securities.startMonth)data.securities.startMonth=thisYM();
  if(!data.securities.ledger)data.securities.ledger={};
  if(!data.securities.values)data.securities.values={};
  if(!data.securities.notes)data.securities.notes={};
  if(data.securities.benchmark===undefined)data.securities.benchmark=null;
  return data.securities;
}
// the default monthly contribution drawn from the Plan "Monthly saving" control
function defaultContribution(){const el=$('contrib');return el?(+el.value||0):0;}

// drop any ledger entries that sit in the future (we never model non-existent past/future savings)
function reconcileSecurities(){
  if(!data.securities)return;
  const cur=thisYM();
  ['ledger','values','notes'].forEach(k=>{const o=data.securities[k];if(o)
    Object.keys(o).forEach(m=>{if(ymCompare(m,cur)>0)delete o[m];});});
}

// build the month-by-month running balance from start to the current month (inclusive)
function securitiesSeries(){
  const s=ensureSecurities();const cur=thisYM();
  if(ymCompare(s.startMonth,cur)>0)s.startMonth=cur; // never start in the future
  const out=[];let bal=+s.startBalance||0;
  out.push({ym:s.startMonth,balance:bal,contrib:0,start:true});
  let m=ymAdd(s.startMonth,1),guard=0;
  while(ymCompare(m,cur)<=0&&guard<1200){
    const c=(s.ledger[m]!=null)?+s.ledger[m]:defaultContribution();
    bal+=c;out.push({ym:m,balance:bal,contrib:c,start:false});
    m=ymAdd(m,1);guard++;
  }
  return out;
}
function securitiesCurrentBalance(){const ser=securitiesSeries();return ser.length?ser[ser.length-1].balance:0;}
function securitiesTotalContributed(){const s=ensureSecurities();return securitiesCurrentBalance()-(+s.startBalance||0);}

/* ---- full per-month series: invested (cost basis), recorded market value, benchmark ---- */
function investSeries(){
  const s=ensureSecurities(), cur=thisYM();
  if(ymCompare(s.startMonth,cur)>0)s.startMonth=cur;
  const bench=benchmarkValues();        // {ym:value} or null
  const out=[]; let invested=+s.startBalance||0;
  let m=s.startMonth, guard=0;
  while(ymCompare(m,cur)<=0&&guard<1200){
    if(m!==s.startMonth){const c=(s.ledger[m]!=null)?+s.ledger[m]:defaultContribution();invested+=c;}
    const contrib=(m===s.startMonth)?0:((s.ledger[m]!=null)?+s.ledger[m]:defaultContribution());
    out.push({ym:m, invested:invested, contrib:contrib,
      value:(s.values[m]!=null)?+s.values[m]:null,
      note:s.notes[m]||'', start:(m===s.startMonth),
      bench:(bench&&bench[m]!=null)?bench[m]:null});
    m=ymAdd(m,1);guard++;
  }
  return out;
}
function investedToDate(){const ser=investSeries();return ser.length?ser[ser.length-1].invested:0;}
// most recent recorded market value (and its month)
function latestValue(){const s=ensureSecurities();let best=null,bestM=null;
  Object.keys(s.values).forEach(m=>{if(best===null||ymCompare(m,bestM)>0){best=+s.values[m];bestM=m;}});
  return best===null?null:{value:best,ym:bestM};}
function currentGain(){const lv=latestValue();if(!lv)return null;
  // invested up to the month of the latest reading
  const ser=investSeries();let inv=0;for(const d of ser){if(ymCompare(d.ym,lv.ym)<=0)inv=d.invested;}
  return {value:lv.value, invested:inv, gain:lv.value-inv, ym:lv.ym};}

/* ---- money-weighted (IRR) return: solves the monthly rate, annualised ---- */
function moneyWeightedReturn(){
  const s=ensureSecurities(), lv=latestValue(); if(!lv)return null;
  const ser=investSeries(); if(ser.length<3)return null;       // too little history to be meaningful
  // cash flows indexed by month offset from start: outflows (invested) negative, terminal value positive
  const flows=[]; const base=s.startMonth;
  function off(m){let n=0,c=base;while(ymCompare(c,m)<0&&n<5000){c=ymAdd(c,1);n++;}return n;}
  if((+s.startBalance||0)>0)flows.push({t:0,amt:-(+s.startBalance)});
  ser.forEach(d=>{if(!d.start&&d.contrib)flows.push({t:off(d.ym),amt:-d.contrib});});
  flows.push({t:off(lv.ym),amt:lv.value});
  if(flows.length<2)return null;
  const npv=r=>flows.reduce((a,f)=>a+f.amt/Math.pow(1+r,f.t),0);
  // bisection for monthly rate in (-0.9, 1)
  let lo=-0.9,hi=1.0,fLo=npv(lo),fHi=npv(hi);
  if(fLo*fHi>0)return null;                                    // no sign change -> undefined
  for(let i=0;i<80;i++){const mid=(lo+hi)/2,fm=npv(mid);if(fm===0)break;(fLo*fm<0)?(hi=mid,fHi=fm):(lo=mid,fLo=fm);}
  const rm=(lo+hi)/2;
  return Math.pow(1+rm,12)-1;                                  // annualised
}

/* ---- frozen benchmark: project from the snapshotted plan, anchored at "investing since".
   Equity weight glides from eqGs to eqGe over the plan's accumulation horizon, mirroring the
   Sandbox "mix" curve (the realistic line the verdict is based on). ---- */
function benchmarkValues(){
  const s=data.securities, b=s&&s.benchmark; if(!b)return null;
  const cur=thisYM(); const out={};
  const horM=Math.max(1, b.horizonM||((b.eqGs!=null&&b.eqGe!=null)?360:1));
  let bal=+b.startBalance||0, m=b.anchorMonth, k=0, guard=0;
  out[m]=bal;
  m=ymAdd(m,1);
  while(ymCompare(m,cur)<=0&&guard<1200){
    const t=Math.max(0,Math.min(1,k/horM));                   // glide progress
    const w=Math.max(0,Math.min(1, b.eqGs+(b.eqGe-b.eqGs)*t));
    const annual=w*b.eqR+(1-w)*b.bdR-b.fee;
    const mr=Math.pow(1+Math.max(-0.95,annual),1/12)-1;
    const c=b.contrib*Math.pow(1+b.step,Math.floor(k/12));
    bal=bal*(1+mr)+c; out[m]=bal; k++; m=ymAdd(m,1); guard++;
  }
  return out;
}
function setBenchmarkFromSandbox(){
  const s=ensureSecurities(), p=P();
  s.benchmark={setMonth:thisYM(), anchorMonth:s.startMonth, startBalance:+s.startBalance||0,
    contrib:p.contrib, step:p.step, eqR:p.eqR, bdR:p.bdR, fee:p.fee, infl:p.infl, eqGs:p.eqGs, eqGe:p.eqGe,
    horizonM:Math.max(1,Math.round((p.horizon||30)*12))};
  renderInvest();persist();
}
function clearBenchmark(){const s=ensureSecurities();s.benchmark=null;renderInvest();persist();}
// build the benchmark summary line from the frozen snapshot + the user's chosen detail toggles (item 16)
function benchLabelText(){
  const b=data.securities&&data.securities.benchmark; if(!b)return t('pf.noBenchmark');
  const d=settings.benchDetail||{}, parts=[t('bench.set',{m:b.setMonth})];
  if(d.contrib)parts.push('\u20ac'+Math.round(b.contrib).toLocaleString('de-DE')+t('unit.perMo')+(b.step?(' '+t('bench.step',{n:(b.step*100).toFixed(0)})):''));
  if(d.glide)parts.push(Math.round(b.eqGs*100)+'\u2192'+Math.round(b.eqGe*100)+'% '+t('fc.eqShort'));
  if(d.eqR)parts.push((b.eqR*100).toFixed(1)+'% '+t('fc.eqShort'));
  if(d.bdR)parts.push((b.bdR*100).toFixed(1)+'% '+t('bench.bond'));
  if(d.infl&&b.infl!=null)parts.push((b.infl*100).toFixed(1)+'% '+t('bench.infl'));
  if(d.fee)parts.push((b.fee*100).toFixed(2)+'% '+t('bench.fee'));
  return parts.join(' \u00b7 ');
}
function refreshBenchLabel(){const bl=$('invBenchLbl');if(bl)bl.textContent=benchLabelText();}

/* =================== INVEST (real "Plan" tab) rendering =================== */
function eurPct(x){return (x>=0?'+':'\u2212')+Math.abs(x*100).toFixed(1)+'%';}
// stats + charts only — safe to call on every keystroke (does NOT rebuild the ledger inputs)
function refreshInvestLive(){
  const s=ensureSecurities();
  const invested=investedToDate(), lv=latestValue(), cg=currentGain(), mwr=moneyWeightedReturn();
  const setTxt=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  const vEl=$('invValue');
  if(vEl){vEl.textContent=lv?eurF(lv.value):'\u2014';
    // green if current value is above what was invested by then, red if below (item: vibrant value colour)
    vEl.style.color=(lv&&cg)?(cg.gain>=0?GAIN_GREEN:LOSS_RED):'';}
  setTxt('invValueCap', lv?t('pf.asOf',{m:ymLabel(lv.ym)}):t('pf.noValueYet'));
  setTxt('invInvested', eurF(invested));
  if(cg){const g=$('invGain');if(g){g.textContent=(cg.gain>=0?'+':'\u2212')+eurF(Math.abs(cg.gain));
    g.className='big';g.style.color=(cg.gain>=0?GAIN_GREEN:LOSS_RED);}
    setTxt('invGainPct', cg.invested>0?eurPct(cg.gain/cg.invested)+' total':'\u2014');
  }else{const g=$('invGain');if(g){g.textContent='\u2014';g.className='big';g.style.color='';}setTxt('invGainPct',t('pf.recordToSeeGains'));}
  const rEl=$('invReturn');
  if(rEl){rEl.textContent=mwr==null?'\u2014':eurPct(mwr);rEl.style.color=(mwr==null?'':(mwr>=0?GAIN_GREEN:LOSS_RED));}
  setTxt('invReturnCap', mwr==null?t('pf.needsHistory'):t('pf.mwrCap'));
  // Net income + free-to-save (from Track), current calendar month
  const inc=+ (data.income[currentYear]||0);
  const mIdx=new Date().getMonth();
  const monthCost=perMonthTotals(currentYear)[mIdx];
  const free=inc-monthCost;
  setTxt('invNetIncome', inc>0?eurF(inc):'\u2014');
  const fe=$('invFree');if(fe){fe.textContent=inc>0?((free>=0?'+':'\u2212')+eurF(Math.abs(free))):'\u2014';
    fe.className='big '+(inc>0?(free>=0?'pos':'neg'):'');}
  setTxt('invFreeCap', inc>0?t('pf.inMonth',{m:MONTHS[mIdx]}):t('pf.setIncome'));
  const elStart=$('secStartBalN');if(elStart&&document.activeElement!==elStart)
    elStart.value=(+s.startBalance||0)?String(+s.startBalance).replace('.',','):'';
  const elSince=$('secSince');if(elSince&&document.activeElement!==elSince)elSince.value=s.startMonth;
  const bl=$('invBenchLbl');if(bl)bl.textContent=benchLabelText();
  const bc=$('invBenchClear');if(bc)bc.style.display=s.benchmark?'':'none';
  drawInvestValue();drawInvestGain();
}
function renderInvest(){ refreshInvestLive(); buildInvestLedger(); }

/* ---- value-over-time chart: invested (shaded) + recorded value line + benchmark dashes ---- */
function drawInvestValue(){
  const cv=$('cvInvestValue');if(!cv)return;const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=200;
  if(!W)return;
  cv.style.height=H+'px';cv.width=W*dpr;cv.height=H*dpr;
  const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  const ser=investSeries();const n=ser.length;
  const C_GRID=cssVar('--grid'),C_AXIS=cssVar('--axis'),C_EQ=cssVar('--eq'),C_BD=cssVar('--bd'),C_PAID=cssVar('--chartpaid');
  const pad={l:56,r:12,t:12,b:22};
  let maxV=1;ser.forEach(d=>{maxV=Math.max(maxV,d.invested,d.value||0,d.bench||0);});
  function niceStep(v){const pw=Math.pow(10,Math.floor(Math.log10(v)));const f=v/pw;
    let nf;if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=2.5)nf=2.5;else if(f<=5)nf=5;else nf=10;return nf*pw;}
  const STEPS=4,step=niceStep(maxV/STEPS),top=step*STEPS||1;
  const X=i=>pad.l+(W-pad.l-pad.r)*(n<=1?0.5:(i/(n-1)));
  const Y=v=>H-pad.b-(H-pad.t-pad.b)*(v/top);
  ctx.font='10px "Spline Sans Mono",monospace';
  for(let i=0;i<=STEPS;i++){const v=step*i,y=Y(v);ctx.strokeStyle=C_GRID;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle=C_AXIS;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(eur(v),pad.l-6,y);}
  ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle=C_AXIS;
  ctx.fillText(ymLabel(ser[0].ym),X(0),H-pad.b+4);
  if(n>1)ctx.fillText(ymLabel(ser[n-1].ym),X(n-1),H-pad.b+4);
  _investGeom={W:W,H:H,pad:pad,top:top,maxV:top,n:n,ser:ser,X:X,Y:Y};
  if(n===1){
    ctx.fillStyle=C_PAID;ctx.beginPath();ctx.arc(X(0),Y(ser[0].invested),3.2,0,7);ctx.fill();
    if(ser[0].value!=null){ctx.fillStyle=C_EQ;ctx.beginPath();ctx.arc(X(0),Y(ser[0].value),3.4,0,7);ctx.fill();}
    return;
  }
  // invested area (shaded) — the gap up to the value line is your gain
  ctx.beginPath();ser.forEach((d,i)=>{const x=X(i),y=Y(d.invested);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.lineTo(X(n-1),Y(0));ctx.lineTo(X(0),Y(0));ctx.closePath();ctx.fillStyle=cssVar('--bd-wash');ctx.fill();
  // invested line
  ctx.beginPath();ser.forEach((d,i)=>{const x=X(i),y=Y(d.invested);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.strokeStyle=C_PAID;ctx.lineWidth=1.6;ctx.setLineDash([5,4]);ctx.lineJoin='round';ctx.stroke();ctx.setLineDash([]);
  // benchmark dashed line
  if(ser.some(d=>d.bench!=null)){
    ctx.beginPath();let started=false;
    ser.forEach((d,i)=>{if(d.bench==null)return;const x=X(i),y=Y(d.bench);started?ctx.lineTo(x,y):ctx.moveTo(x,y);started=true;});
    ctx.strokeStyle=C_BD;ctx.globalAlpha=0.8;ctx.lineWidth=1.6;ctx.setLineDash([3,3]);ctx.stroke();
    ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  // recorded value line (connect only recorded points) + markers
  const recorded=ser.map((d,i)=>({i:i,v:d.value})).filter(o=>o.v!=null);
  if(recorded.length){
    ctx.beginPath();recorded.forEach((o,k)=>{const x=X(o.i),y=Y(o.v);k?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.strokeStyle=C_EQ;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
    ctx.fillStyle=C_EQ;recorded.forEach(o=>{ctx.beginPath();ctx.arc(X(o.i),Y(o.v),2.8,0,7);ctx.fill();});
  }
}

/* ---- monthly market change bars (value change minus contributions) ---- */
function drawInvestGain(){
  const cv=$('cvInvestGain');if(!cv)return;const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=150;
  if(!W)return;
  cv.style.height=H+'px';cv.width=W*dpr;cv.height=H*dpr;
  const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  const ser=investSeries();
  // monthly market gain between consecutive recorded values
  const recorded=ser.map((d,i)=>({i:i,ym:d.ym,v:d.value})).filter(o=>o.v!=null);
  const allBars=[];
  for(let k=1;k<recorded.length;k++){
    let contribBetween=0;for(let j=recorded[k-1].i+1;j<=recorded[k].i;j++)contribBetween+=ser[j].contrib;
    allBars.push({ym:recorded[k].ym, gain:recorded[k].v-recorded[k-1].v-contribBetween});
  }
  // window: last `changeWin` months ending at (current month - changeOffset), anchored on now (item 13)
  const win=settings.changeWin||12;
  const winEnd=ymAdd(thisYM(),-changeOffset), winStart=ymAdd(winEnd,-(win-1));
  const bars=allBars.filter(b=>ymCompare(b.ym,winStart)>=0&&ymCompare(b.ym,winEnd)<=0);
  updateChangeControls(allBars,winStart,winEnd);
  const C_GRID=cssVar('--grid'),C_AXIS=cssVar('--axis');
  const pad={l:56,r:12,t:12,b:22};
  if(!bars.length){ctx.fillStyle=C_AXIS;ctx.font='11px "Spline Sans Mono",monospace';ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(allBars.length?'no recorded change in this window':'record values in two+ months to see monthly change',W/2,H/2);return;}
  let mx=0;bars.forEach(b=>mx=Math.max(mx,Math.abs(b.gain)));mx=mx||1;
  function niceStep(v){const pw=Math.pow(10,Math.floor(Math.log10(v)));const f=v/pw;
    let nf;if(f<=1)nf=1;else if(f<=2)nf=2;else if(f<=2.5)nf=2.5;else if(f<=5)nf=5;else nf=10;return nf*pw;}
  const step=niceStep(mx/2),top=step*2||1;
  const mid=pad.t+(H-pad.t-pad.b)/2;
  const Y=v=>mid-(H-pad.t-pad.b)/2*(v/top);
  ctx.font='10px "Spline Sans Mono",monospace';
  [-top,0,top].forEach(v=>{const y=Y(v);ctx.strokeStyle=C_GRID;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle=C_AXIS;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(eur(v),pad.l-6,y);});
  // fixed slot count = window width so spacing is stable as you scroll
  const innerW=W-pad.l-pad.r, slot=innerW/win, bw=Math.min(slot*0.6,30);
  ctx.textAlign='center';ctx.textBaseline='top';
  bars.forEach(b=>{
    // position by month distance from winStart so gaps (unrecorded months) show correctly
    let idx=0,c=winStart;while(ymCompare(c,b.ym)<0&&idx<600){c=ymAdd(c,1);idx++;}
    const cx=pad.l+slot*idx+slot/2,y0=Y(0),y1=Y(b.gain);
    ctx.fillStyle=b.gain>=0?GAIN_GREEN:LOSS_RED;ctx.fillRect(cx-bw/2,Math.min(y0,y1),bw,Math.abs(y1-y0)||1);
    const p=ymToParts(b.ym);ctx.fillStyle=C_AXIS;
    ctx.fillText(MINI[p.mo]+(p.mo===0?(' \u2019'+('0'+(p.y%100)).slice(-2)):''),cx,H-pad.b+4);});
}
function maxChangeOffset(allBars){if(!allBars||!allBars.length)return 0;
  const oldest=allBars[0].ym, win=settings.changeWin||12;
  // offset so window's start reaches the oldest bar
  let off=0,end=ymAdd(thisYM(),0),guard=0;
  while(guard<600){const start=ymAdd(end,-(win-1));if(ymCompare(start,oldest)<=0)break;end=ymAdd(end,-1);off++;guard++;}
  return off;}
function updateChangeControls(allBars,winStart,winEnd){
  const cap=$('invChangeRange');if(cap)cap.textContent=ymLabel(winStart)+' \u2013 '+ymLabel(winEnd);
  const maxOff=maxChangeOffset(allBars);
  const prev=$('invChangePrev'),next=$('invChangeNext');
  if(prev)prev.disabled=(changeOffset>=maxOff);   // can't go further back
  if(next)next.disabled=(changeOffset<=0);        // can't go past current month
}
function shiftChangeWindow(deltaMonths){
  const allBars=(function(){const ser=investSeries();const rec=ser.map((d,i)=>({i:i,ym:d.ym,v:d.value})).filter(o=>o.v!=null);
    const b=[];for(let k=1;k<rec.length;k++)b.push({ym:rec[k].ym});return b;})();
  const maxOff=maxChangeOffset(allBars);
  changeOffset=Math.max(0,Math.min(maxOff,changeOffset+deltaMonths));
  drawInvestGain();
}

/* ---- editable month ledger: contribution (override), market value, note ---- */
function numericFilter(inp){ // keep digits + , . only; preserve caret where possible
  const before=inp.value, clean=before.replace(/[^\d.,]/g,'');
  if(clean!==before){const pos=(inp.selectionStart||clean.length)-(before.length-clean.length);
    inp.value=clean;try{inp.setSelectionRange(Math.max(0,pos),Math.max(0,pos));}catch(e){}}
  return clean;
}
function buildInvestLedger(){
  const body=$('invLedBody');if(!body)return;body.innerHTML='';
  const s=ensureSecurities(), ser=investSeries();
  let rows=ser.slice().reverse();                              // newest first
  const total=rows.length, CAP=12;
  const hiddenCount=invLedExpanded?0:Math.max(0,total-CAP);
  if(!invLedExpanded&&total>CAP)rows=rows.slice(0,CAP);
  rows.forEach(pt=>{
    const row=document.createElement('div');row.className='ilrow'+(pt.start?' start':'');
    const lab=document.createElement('span');lab.className='ilm';lab.textContent=ymLabel(pt.ym)+(pt.start?' \u00b7 '+t('pf.ledger.start'):'');row.appendChild(lab);
    // contribution (start month shows the starting balance, read-only here — edit it above)
    const cWrap=document.createElement('span');cWrap.className='ilc';
    if(pt.start){const sb=document.createElement('span');sb.className='ilstart';
      sb.textContent=eurF(+s.startBalance||0);sb.title=t('pf.ledger.startTitle');cWrap.appendChild(sb);}
    else{const ci=document.createElement('input');ci.className='ilin';ci.inputMode='decimal';
      ci.placeholder=t('pf.ledger.auto',{amount:eurF(defaultContribution())});
      if(s.ledger[pt.ym]!=null)ci.value=String(s.ledger[pt.ym]).replace('.',',');
      ci.addEventListener('input',()=>{const val=numericFilter(ci);const v=parseNum(val);
        if(val.trim()===''||isNaN(v))delete s.ledger[pt.ym];else s.ledger[pt.ym]=v;
        refreshInvestLive();render();persist();});   // live: no ledger rebuild -> keeps focus
      cWrap.appendChild(ci);}
    row.appendChild(cWrap);
    // market value
    const vWrap=document.createElement('span');vWrap.className='ilv';
    const vi=document.createElement('input');vi.className='ilin';vi.inputMode='decimal';vi.placeholder=t('pf.ledger.value');
    vi.dataset.ym=pt.ym;vi.dataset.kind='value';   // lets the "Record this month" button focus this exact field
    if(s.values[pt.ym]!=null)vi.value=String(s.values[pt.ym]).replace('.',',');
    vi.addEventListener('input',()=>{const val=numericFilter(vi);const v=parseNum(val);
      if(val.trim()===''||isNaN(v))delete s.values[pt.ym];else s.values[pt.ym]=Math.max(0,v);
      refreshInvestLive();persist();});                // live: no ledger rebuild -> keeps focus
    vWrap.appendChild(vi);row.appendChild(vWrap);
    // note
    const nWrap=document.createElement('span');nWrap.className='iln';
    const ni=document.createElement('input');ni.className='ilin ilnote';ni.placeholder=t('pf.ledger.notePlaceholder');
    if(s.notes[pt.ym])ni.value=s.notes[pt.ym];
    ni.addEventListener('input',()=>{const v=ni.value.trim();if(v)s.notes[pt.ym]=v.slice(0,140);else delete s.notes[pt.ym];persist();});
    nWrap.appendChild(ni);row.appendChild(nWrap);
    body.appendChild(row);
  });
  const more=$('invLedMore');
  if(more){if(total>CAP){more.hidden=false;more.textContent=invLedExpanded?'Show less':('Show '+hiddenCount+' older month'+(hiddenCount===1?'':'s'));}
    else more.hidden=true;}
}
// "Record this month's value" is a navigator to the inline ledger field for the current month \u2014
// no native prompt(). The ledger already reaches thisYM (investSeries runs to the current month),
// so we just (re)render, then scroll to and focus that month's value input.
function recordThisMonth(){
  ensureSecurities();
  renderInvest();
  const m=thisYM(), body=$('invLedBody'); if(!body)return;
  const inp=body.querySelector('input.ilin[data-ym="'+m+'"][data-kind="value"]');
  if(inp){try{inp.scrollIntoView({block:'center'});}catch(e){}inp.focus();if(inp.select)inp.select();}
}
let _investGeom=null;

function render(){
  const p=P();
  if(+$('ret').value!==p.retAge)$('ret').value=p.retAge;
  if(+$('end').value!==p.endAge)$('end').value=p.endAge;
  const M=computeModel(p);
  labels(M);
  drawLife(M);

  $('sPotEq').textContent=eur(ptValue(M.eq.potAtRet,p));
  $('sPotMix').textContent=eur(ptValue(M.mix.potAtRet,p));
  $('sPotEqSafe').textContent=t('fc.safe')+' '+eurF(M.eq.sustainable)+t('unit.perMo');
  $('sPotMixSafe').textContent=t('fc.safe')+' '+eurF(M.mix.sustainable)+t('unit.perMo');
  // Surface what the yearly allowance is actually worth — otherwise the toggle moves a number too
  // small to see against the headline pot. Use the realistic glide-path (mix) strategy.
  const _sv=$('spbSaved');
  if(_sv){if(p.spb&&M.mix.taxSaved>0){_sv.textContent=t('fc.allowanceSaved',{amt:eurF(M.mix.taxSaved)});_sv.hidden=false;}
    else _sv.hidden=true;}

  function lastTxt(strat,idL,idS){if(strat.ranOut===null){$(idL).textContent=t('fc.ageValPlus',{n:p.endAge});$(idS).textContent=t('fc.survives');}
    else{$(idL).textContent=t('fc.ageVal',{n:strat.ranOut.toFixed(0)});$(idS).textContent=t('fc.runsOutEarly');}}
  lastTxt(M.mix,'sLast','sLastSm'); lastTxt(M.eq,'sLastEq','sLastEqSm');
  $('sSafe').textContent=eurF(M.mix.sustainable); $('sSafeEq').textContent=eurF(M.eq.sustainable);
  $('sSafeAge').textContent=p.endAge; $('sSafeAge2').textContent=p.endAge;

  const s=M.mix, v=$('verdict');
  // Gate the personal verdict: until the user has set BOTH income and a saving amount, show an
  // honest "add your numbers" prompt instead of a confident claim built on default sliders.
  if(typeof forecastReady==='function'&&!forecastReady()){
    v.className='verdict empty';
    $('vIcon').innerHTML='&#9679;';
    $('vTitle').textContent=t('verdict.empty.title');
    $('vBody').textContent=t('verdict.empty.body');
  }else{
    const ok=s.ranOut===null,close=s.ranOut!==null&&(p.endAge-s.ranOut)<=3;
    v.className='verdict'+(ok?'':(close?' warn':' bad'));
    const safe='\u20ac'+eurF(s.sustainable).replace('\u20ac','')+t('unit.perMo'), endR=endRealValue(s,p);
    if(ok){$('vIcon').innerHTML='&#10003;';$('vTitle').textContent=t('verdict.ok.title');
      $('vBody').innerHTML=t('verdict.ok.body',{income:p.income.toLocaleString('de-DE'),age:p.endAge,left:eur(endR),safe:safe});}
    else if(close){$('vIcon').innerHTML='&#9888;';$('vTitle').textContent=t('verdict.close.title');
      $('vBody').innerHTML=t('verdict.close.body',{age:s.ranOut.toFixed(0),short:(p.endAge-s.ranOut).toFixed(0),safe:safe});}
    else{$('vIcon').innerHTML='&#10007;';$('vTitle').textContent=t('verdict.bad.title');
      $('vBody').innerHTML=t('verdict.bad.body',{age:s.ranOut.toFixed(0),safe:safe});}
  }

  const tb=$('tbody');tb.innerHTML='';
  milestones(p.horizon).forEach(yr=>{const i=Math.min(M.N-1,yr*12-1);
    const eqV=ptValue(M.eq.acc[i],p), mxV=ptValue(M.mix.acc[i],p), pd=paidValue(M.paid[i]);
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+yr+'</td><td>'+(p.age+yr)+'</td><td>'+eurF(pd)+'</td><td class="eqv">'+eurF(eqV)+'</td><td class="bdv">'+eurF(mxV)+'</td><td>'+eurF(eqV-pd)+'</td>';
    tb.appendChild(tr);});
  const _noteMode=money==='real'?t('note0.modeReal'):t('note0.modeNominal');
  const _noteTax=tax==='pre'?t('note0.taxPre'):t('note0.taxAfter',{allowance:p.spb?t('note0.allowance'):''});
  $('note0').innerHTML=t('note0.main',{contrib:p.contrib.toLocaleString('de-DE'),horizon:p.horizon,start:p.start.toLocaleString('de-DE'),mode:_noteMode,tax:_noteTax});

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
// month names are localized (reassigned on a language switch by __kontorRelocalize). MINI is the
// single-letter form — identical first letters in EN and DE — so it stays static.
let MONTHS=(typeof tList==='function'&&tList('months').length===12)?tList('months'):['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MINI  =['J','F','M','A','M','J','J','A','S','O','N','D'];
const THIS_YEAR=new Date().getFullYear();
let currentYear=THIS_YEAR;

function yearList(y){const e=Object.keys(data.expenses).map(Number);
  const inc=Object.keys(data.income).map(Number);
  const all=e.concat(inc,[THIS_YEAR,y]).filter(Number.isFinite);
  let lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);
  // hard safety clamp: never materialise an unreasonable span (defends against poisoned year keys)
  lo=Math.max(lo,THIS_YEAR-200);hi=Math.min(hi,THIS_YEAR+200);if(hi<lo)hi=lo;
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
let GROUP_TINTS=['#26b0a7','#262fb0','#a726b0','#b0262f','#b0a726','#2fb026']; // teal light tints; overwritten by applyAccents()
function newGid(){return 'g'+Math.random().toString(36).slice(2,9);}
function ensureGroups(y){if(!data.groupsByYear)data.groupsByYear={};if(!Array.isArray(data.groupsByYear[y]))data.groupsByYear[y]=[];return data.groupsByYear[y];}
function getGroups(y){return ensureGroups(y);}
function groupById(y,id){return ensureGroups(y).find(g=>g.id===id)||null;}
function addGroup(y,name){const g={id:newGid(),name:name||(typeof t==='function'?t('track.newGroup'):'New group'),collapsed:false};ensureGroups(y).push(g);return g;}
function deleteGroup(y,id){const arr=ensureGroups(y);const i=arr.findIndex(g=>g.id===id);if(i>-1)arr.splice(i,1);
  // only this year's expenses lose the assignment — other years are untouched
  (data.expenses[y]||[]).forEach(e=>{if(e.groupId===id)e.groupId=null;});}
function groupAnnual(y,gid){return getRows(y).filter(e=>(e.groupId||null)===gid).reduce((s,e)=>s+annualActual(e),0);}

/* ----- drag & drop: pointer-based expense move/reorder with an insertion line ----- */
function moveExpense(dragId, targetGid, refId, placeAfter){
  if(!dragId)return;
  const rows=getRows(currentYear);
  const di=rows.findIndex(e=>e.id===dragId); if(di<0)return;
  const [item]=rows.splice(di,1);
  item.groupId=targetGid||null;
  if(refId&&refId!==dragId){
    const ri=rows.findIndex(e=>e.id===refId);
    if(ri<0)rows.push(item); else rows.splice(placeAfter?ri+1:ri,0,item);
  }else{ // append to end of the target group
    let lastIdx=-1; rows.forEach((e,i)=>{if((e.groupId||null)===(targetGid||null))lastIdx=i;});
    if(lastIdx>=0)rows.splice(lastIdx+1,0,item); else rows.push(item);
  }
  renderExpenseTable();refreshSummary();drawMonths();persist();
}

/* pointer-drag state for expense rows */
let _exDrag=null; // {id, line, startY, moved, drop:{gid,refId,after}}
function ensureDropLine(){
  let ln=$('dropLine');
  if(!ln){ln=document.createElement('div');ln.id='dropLine';ln.className='droplinebar';ln.hidden=true;document.body.appendChild(ln);}
  return ln;
}
function startExpenseDrag(ev,id){
  ev.preventDefault();
  const tb=$('expBody');if(!tb)return;
  const srcRow=tb.querySelector('tr.exprow[data-id="'+id+'"]');
  _exDrag={id:id,line:ensureDropLine(),moved:false,drop:null};
  if(srcRow)srcRow.classList.add('dragging');
  const move=e=>onExpenseDragMove(e);
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);finishExpenseDrag();};
  document.addEventListener('pointermove',move);
  document.addEventListener('pointerup',up);
}
function onExpenseDragMove(ev){
  if(!_exDrag)return;_exDrag.moved=true;
  const tb=$('expBody');if(!tb)return;
  const ln=_exDrag.line;
  const rowsEls=Array.from(tb.querySelectorAll('tr.exprow'));
  const heads=Array.from(tb.querySelectorAll('tr.grouprow'));
  const y=ev.clientY;
  // find the nearest insertion point among expense rows; fall back to group headers
  let best=null,bestDist=Infinity,bestAfter=false,bestRefId=null,bestGid=null;
  rowsEls.forEach(r=>{if(r.classList.contains('dragging'))return;
    const rc=r.getBoundingClientRect();const mid=rc.top+rc.height/2;
    const d=Math.abs(y-mid);
    if(d<bestDist){bestDist=d;best=r;bestAfter=y>mid;bestRefId=r.dataset.id;
      bestGid=r.dataset.gid||null;}});
  // also consider dropping into a (possibly empty / collapsed) group header
  heads.forEach(h=>{if(h.classList.contains('ghost'))return;
    const rc=h.getBoundingClientRect();const mid=rc.top+rc.height/2;const d=Math.abs(y-mid);
    if(d<bestDist){bestDist=d;best=h;bestAfter=true;bestRefId=null;bestGid=h.dataset.gid||null;}});
  if(!best){ln.hidden=true;_exDrag.drop=null;return;}
  // resolve target group from the reference row's current group
  if(bestRefId){const rows=getRows(currentYear);const rr=rows.find(e=>e.id===bestRefId);bestGid=rr?(rr.groupId||null):bestGid;}
  _exDrag.drop={gid:bestGid,refId:bestRefId,after:bestAfter};
  // position the insertion line
  const rc=best.getBoundingClientRect();
  const lineY=bestAfter?rc.bottom:rc.top;
  ln.hidden=false;ln.style.left=rc.left+'px';ln.style.width=rc.width+'px';ln.style.top=(lineY-1)+'px';
}
function finishExpenseDrag(){
  if(!_exDrag)return;
  const d=_exDrag.drop, id=_exDrag.id, moved=_exDrag.moved;
  if(_exDrag.line)_exDrag.line.hidden=true;
  const srcRow=$('expBody')?$('expBody').querySelector('tr.exprow[data-id="'+id+'"]'):null;
  if(srcRow)srcRow.classList.remove('dragging');
  _exDrag=null;
  if(moved&&d)moveExpense(id,d.gid,d.refId,d.after);
}

/* pointer-based group reordering */
let _grpDrag=null;
function startGroupDrag(ev,gid){
  ev.preventDefault();
  _grpDrag={id:gid,line:ensureDropLine(),moved:false,beforeId:null,atEnd:false};
  const move=e=>onGroupDragMove(e);
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);finishGroupDrag();};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
}
function onGroupDragMove(ev){
  if(!_grpDrag)return;_grpDrag.moved=true;
  const tb=$('expBody');if(!tb)return;const ln=_grpDrag.line;const y=ev.clientY;
  const heads=Array.from(tb.querySelectorAll('tr.grouprow')).filter(h=>h.dataset.gid&&h.dataset.gid!==_grpDrag.id);
  let best=null,bestDist=Infinity,before=true;
  heads.forEach(h=>{const rc=h.getBoundingClientRect();const mid=rc.top+rc.height/2;const dd=Math.abs(y-mid);
    if(dd<bestDist){bestDist=dd;best=h;before=y<mid;}});
  if(!best){ln.hidden=true;_grpDrag.beforeId=null;_grpDrag.atEnd=true;return;}
  const rc=best.getBoundingClientRect();
  _grpDrag.beforeId=before?best.dataset.gid:nextGroupId(best.dataset.gid);
  _grpDrag.atEnd=false;
  ln.hidden=false;ln.style.left=rc.left+'px';ln.style.width=rc.width+'px';ln.style.top=((before?rc.top:rc.bottom)-1)+'px';
}
function nextGroupId(gid){const gs=getGroups(currentYear);const i=gs.findIndex(g=>g.id===gid);
  return (i>=0&&i+1<gs.length)?gs[i+1].id:null;}
function finishGroupDrag(){
  if(!_grpDrag)return;const {id,moved,beforeId}=_grpDrag;
  if(_grpDrag.line)_grpDrag.line.hidden=true;_grpDrag=null;
  if(!moved)return;
  const gs=getGroups(currentYear);const from=gs.findIndex(g=>g.id===id);if(from<0)return;
  const [g]=gs.splice(from,1);
  if(beforeId==null)gs.push(g);
  else{const to=gs.findIndex(x=>x.id===beforeId);if(to<0)gs.push(g);else gs.splice(to,0,g);}
  renderExpenseTable();persist();
}

/* ----- one expense row ----- */
function buildExpenseRow(e, rows){
  const tr=document.createElement('tr'); tr.className='exprow'; tr.dataset.id=e.id;
  tr.dataset.gid=e.groupId||'';
  // name cell: leading drag handle (aligned with the group grip) + auto-growing textarea
  const tdN=document.createElement('td');tdN.className='namecol';
  const nw=document.createElement('div');nw.className='namewrap';
  const grip=document.createElement('button');grip.className='draghandle';grip.innerHTML='&#8942;';
  grip.title='Drag to reorder or move to another group';grip.setAttribute('aria-label','Drag to reorder or regroup');
  grip.addEventListener('pointerdown',ev=>startExpenseDrag(ev,e.id));
  const inN=document.createElement('textarea');inN.className='ein name';inN.rows=1;
  inN.value=e.name;inN.placeholder='e.g. Rent';
  inN.addEventListener('input',()=>{e.name=inN.value;autoGrow(inN);refreshDerived();persist();});
  nw.appendChild(grip);nw.appendChild(inN);tdN.appendChild(nw);
  // amount + unit toggle
  const tdA=document.createElement('td');tdA.className='amtcell';
  const inA=document.createElement('input');inA.className='ein amt';inA.inputMode='decimal';
  inA.value=e.amount?String(e.amount).replace('.',','):'';inA.placeholder='0';
  inA.addEventListener('input',()=>{const v=parseNum(inA.value);
    e.amount=isNaN(v)?0:v;updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();drawMonths();persist();});
  tdA.appendChild(inA);
  const sel=document.createElement('select');sel.className='unitsel';
  sel.innerHTML='<option value="month">\u20ac / mo</option><option value="year">\u20ac / yr</option>';
  sel.value=e.unit;
  sel.addEventListener('change',()=>{e.unit=sel.value;updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();drawMonths();persist();});
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
  allBtn.title='Toggle all months';allBtn.setAttribute('aria-label','Toggle all months');
  allBtn.addEventListener('click',()=>{const fill=activeCount(e)<12;e.months=Array(12).fill(fill);
    Array.from(grid.querySelectorAll('.msq')).forEach(sq=>sq.classList.toggle('on',fill));
    updateRowDerived(tr,e);refreshGroupSubtotals();refreshSummary();drawMonths();persist();});
  grid.appendChild(allBtn);
  tdM.appendChild(grid);tr.appendChild(tdM);
  // derived: monthly + annual
  const tdMo=document.createElement('td');tdMo.className='dvm';tr.appendChild(tdMo);
  const tdYr=document.createElement('td');tdYr.className='dvy';tr.appendChild(tdYr);
  // actions: delete only (the drag handle now lives at the start of the name cell)
  const tdX=document.createElement('td');tdX.className='actcell';
  const del=document.createElement('button');del.className='delx';del.innerHTML='&times;';del.title='Delete';del.setAttribute('aria-label','Delete expense');
  del.addEventListener('click',()=>{const i=rows.indexOf(e);if(i>-1)rows.splice(i,1);
    renderExpenseTable();refreshSummary();drawMonths();persist();});
  const actwrap=document.createElement('div');actwrap.className='actwrap';
  // non-drag "move to group" control (works on touch, where the drag handle is hidden). Only
  // shown when there's somewhere to move to. Calls the same moveExpense() the drag path uses.
  const groups=getGroups(currentYear);
  const targets=groups.filter(g=>g.id!==(e.groupId||null));
  if(targets.length||e.groupId){
    const mv=document.createElement('select');mv.className='movesel';
    mv.title=t('track.moveTo');mv.setAttribute('aria-label',t('track.moveTo'));
    const ph=document.createElement('option');ph.value='';ph.textContent='↪';ph.disabled=true;ph.selected=true;mv.appendChild(ph);
    targets.forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.name||t('track.newGroup');mv.appendChild(o);});
    if(e.groupId){const o=document.createElement('option');o.value='__ungrouped__';o.textContent=t('track.ungrouped');mv.appendChild(o);}
    mv.addEventListener('change',()=>{const val=mv.value;if(val==='')return;
      moveExpense(e.id, val==='__ungrouped__'?null:val, null, false);});
    actwrap.appendChild(mv);
  }
  actwrap.appendChild(del);
  tdX.appendChild(actwrap);tr.appendChild(tdX);
  updateRowDerived(tr,e);
  return tr;
}

/* ----- whole-table (re)build, grouped into collapsible sections ----- */
function renderExpenseTable(){
  const y=currentYear, groups=getGroups(y), rows=getRows(y), tb=$('expBody'); tb.innerHTML='';
  const buckets=groups.map((g,i)=>({g:g,tint:'var(--tint'+(i%6)+')'}));
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
    // group drag grip (reorder groups) — named groups only
    if(b.g){const ggrip=document.createElement('button');ggrip.className='ggrip';ggrip.innerHTML='&#8942;';
      ggrip.title='Drag to reorder groups';ggrip.setAttribute('aria-label','Drag to reorder group');
      ggrip.addEventListener('pointerdown',ev=>startGroupDrag(ev,b.g.id));
      wrap.appendChild(ggrip);}
    const car=document.createElement('button');car.className='gcaret';car.textContent=collapsed?'\u25B8':'\u25BE';
    car.setAttribute('aria-label',collapsed?'Expand group':'Collapse group');
    if(b.g)car.addEventListener('click',()=>{b.g.collapsed=!b.g.collapsed;renderExpenseTable();persist();});
    else car.style.visibility='hidden';
    wrap.appendChild(car);
    if(b.g){const gn=document.createElement('input');gn.className='gname';gn.value=b.g.name;
      gn.addEventListener('input',()=>{b.g.name=gn.value;persist();});
      gn.addEventListener('change',()=>renderExpenseTable());
      wrap.appendChild(gn);}
    else{const gn=document.createElement('span');gn.className='gname ung';gn.textContent=t('track.ungrouped');wrap.appendChild(gn);}
    const cnt=document.createElement('span');cnt.className='gcount';cnt.textContent=members.length;wrap.appendChild(cnt);
    // sort A–Z within this group (one-shot)
    if(members.length>1){const srt=document.createElement('button');srt.className='gsort';srt.textContent='A\u2013Z';
      srt.title='Sort expenses in this group alphabetically';srt.setAttribute('aria-label','Sort expenses in this group alphabetically');
      srt.addEventListener('click',()=>{sortGroup(gid);});
      wrap.appendChild(srt);}
    const add=document.createElement('button');add.className='gadd';add.textContent=t('track.addInline');add.title=t('track.addExpense');add.setAttribute('aria-label',t('track.addExpense'));
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
    if(b.g){const dg=document.createElement('button');dg.className='gdel';dg.innerHTML='&times;';dg.title='Delete group for this year (its expenses move to Ungrouped; other years keep the group)';dg.setAttribute('aria-label','Delete group');
      dg.addEventListener('click',()=>{deleteGroup(currentYear,b.g.id);renderExpenseTable();persist();});
      cX.appendChild(dg);}
    hr.appendChild(cL);hr.appendChild(cMo);hr.appendChild(cYr);hr.appendChild(cX);
    // hide the Ungrouped header when there are groups AND no ungrouped members (avoid clutter)
    if(!b.g&&members.length===0&&groups.length>0)hr.classList.add('ghost');
    tb.appendChild(hr);
    if(!collapsed)members.forEach(e=>tb.appendChild(buildExpenseRow(e,rows)));
  });
  tb.querySelectorAll('textarea.name').forEach(autoGrow);
  refreshGroupSubtotals();refreshSummary();drawMonths();syncCollapseAllBtn();
}

/* ----- collapse / expand every group for the current year in one click ----- */
function toggleAllGroups(){
  const groups=getGroups(currentYear);
  if(!groups.length)return;
  const collapse=groups.some(g=>!g.collapsed);   // any open -> collapse all; all closed -> expand all
  groups.forEach(g=>g.collapsed=collapse);
  renderExpenseTable();persist();
}
// keep the header button's label/visibility in sync with the groups' state
function syncCollapseAllBtn(){
  const btn=$('collapseAll');if(!btn)return;
  const groups=getGroups(currentYear);
  if(!groups.length){btn.hidden=true;return;}
  btn.hidden=false;
  const anyOpen=groups.some(g=>!g.collapsed);
  btn.textContent=anyOpen?t('track.collapseAll'):t('track.expandAll');
  btn.setAttribute('aria-label',anyOpen?t('track.collapseAll'):t('track.expandAll'));
}

/* ----- sort one group's expenses alphabetically (one-shot, preserves cross-group order) ----- */
function sortGroup(gid){
  const rows=getRows(currentYear);
  const inGroup=rows.filter(e=>(e.groupId||null)===(gid||null));
  if(inGroup.length<2)return;
  const sorted=inGroup.slice().sort((a,b)=>(a.name||'').trim().toLowerCase()
    .localeCompare((b.name||'').trim().toLowerCase(),'de'));
  // splice sorted members back into the positions currently held by this group's rows
  const positions=[];rows.forEach((e,i)=>{if((e.groupId||null)===(gid||null))positions.push(i);});
  positions.forEach((pos,k)=>{rows[pos]=sorted[k];});
  renderExpenseTable();persist();
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
  // current calendar month, applied to whichever year is shown
  const mIdx=new Date().getMonth();
  const monthCost=perMonthTotals(y)[mIdx];
  const mName=MONTHS[mIdx];
  $('sumAnnual').textContent=eurF(annual);
  // "This month" tile (precise current-month cost) + average shown as context
  const tm=$('sumThisMonth');if(tm)tm.textContent=eurF(monthCost);
  const tmc=$('sumThisMonthCap');if(tmc)tmc.textContent=mName+(y!==THIS_YEAR?' '+y:'');
  const av=$('sumMonthly');if(av)av.textContent=eurF(monthlyAvg);
  $('sumCount').textContent=rows.length+(rows.length===1?' item':' items');
  // bridge: income - THIS MONTH's actual fixed costs (not the average)
  const inc=parseNum($('incomeN').value)||0;
  const free=inc-monthCost;
  $('sumFree').textContent=eurF(free);
  $('sumFree').className='big '+(free<0?'neg':'pos');
  const fc=$('freeCap');if(fc)fc.textContent='in '+mName;
  $('freeNote').textContent= inc>0
    ? (free>=0?'left to save / invest in '+mName:'over budget in '+mName+' \u2014 spending exceeds income')
    : 'enter your net monthly income above';
  $('pushSave').disabled=!(inc>0&&free>0);
}

/* ----- monthly breakdown bar chart (matches Plan canvas style) ----- */
let _monthBars=[];   // [{m,x,w,top,bottom,total}] in CSS px for hit-testing
// screen-reader fallback for the cost-by-month canvas: a visually-hidden data table
function fillMonthsTable(){
  const tb=$('cvMonthsTable');if(!tb)return;const body=tb.tBodies[0]||tb;
  const totals=perMonthTotals(currentYear);
  let html='<tr><th>'+escapeHTML(t('pf.ledger.month'))+'</th><th>'+escapeHTML(t('th.permo'))+'</th></tr>';
  totals.forEach((v,m)=>{html+='<tr><td>'+escapeHTML(MONTHS[m])+'</td><td>'+escapeHTML(eurF(v))+'</td></tr>';});
  body.innerHTML=html;
}
function drawMonths(){
  fillMonthsTable();   // keep the SR table current even if the canvas isn't visible
  const cv=$('cvMonths');if(!cv)return;const dpr=window.devicePixelRatio||1,W=cv.clientWidth,H=210;
  if(!W)return;
  cv.style.height=H+'px';
  cv.width=W*dpr;cv.height=H*dpr;const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  const t=perMonthTotals(currentYear),pad={l:50,r:12,t:12,b:22};
  const C_GRID=cssVar('--grid'),C_AXIS=cssVar('--axis'),C_BD=cssVar('--bd'),C_EQ=cssVar('--eq');
  const curM=(currentYear===THIS_YEAR)?new Date().getMonth():-1;
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
  _monthBars=[];
  ctx.textAlign='center';ctx.textBaseline='top';
  t.forEach((v,m)=>{const cx=pad.l+slot*m+slot/2, yTop=Y(v);
    const x=cx-bw/2,yy=yTop,wd=bw,hh=H-pad.b-yTop,rr=Math.min(3,wd/2,hh);
    const hovered=(m===_hoverMonth);
    // subtle full-height band behind the hovered month
    if(hovered){ctx.fillStyle=cssVar('--eq-wash');ctx.fillRect(pad.l+slot*m,pad.t,slot,H-pad.b-pad.t);}
    let barCol=(m===curM)?C_EQ:C_BD; if(hovered)barCol=shade(barCol,0.16); // brighten on hover
    ctx.fillStyle=barCol;ctx.beginPath();
    if(hh>0){ctx.moveTo(x,yy+hh);ctx.lineTo(x,yy+rr);ctx.quadraticCurveTo(x,yy,x+rr,yy);
      ctx.lineTo(x+wd-rr,yy);ctx.quadraticCurveTo(x+wd,yy,x+wd,yy+rr);ctx.lineTo(x+wd,yy+hh);ctx.closePath();ctx.fill();}
    // record the full slot column for easy hovering (not just the bar)
    _monthBars.push({m:m,x:pad.l+slot*m,w:slot,top:pad.t,bottom:H-pad.b,total:v});
    ctx.fillStyle=(m===curM||hovered)?cssVar('--ink'):C_AXIS;ctx.fillText(MINI[m],cx,H-pad.b+5);});
  _monthGeom={W:W,H:H,pad:pad,maxV:maxV,slot:slot};
}

/* ----- hover tooltip: combined cost + per-expense breakdown for a month ----- */
function monthBreakdown(y,m){
  const out=[];getRows(y).forEach(e=>{if(e.months[m]){const r=monthlyRate(e);if(r>0)out.push({name:e.name||'(unnamed)',amt:r});}});
  out.sort((a,b)=>b.amt-a.amt);return out;
}
function wireMonthsHover(){
  const cv=$('cvMonths'),tip=$('monthTip');if(!cv)return;
  function clearAll(){if(tip)tip.hidden=true;
    if(_hoverMonth!==-1){_hoverMonth=-1;drawMonths();}
    drawCrosshair('cvMonthsOv',_monthGeom,null,null);}
  cv.addEventListener('mousemove',ev=>{
    const r=cv.getBoundingClientRect();const x=ev.clientX-r.left,yv=ev.clientY-r.top;
    const hit=_monthBars.find(b=>x>=b.x&&x<b.x+b.w&&yv>=b.top&&yv<=b.bottom);
    if(!hit){clearAll();return;}
    // highlight hovered bar (redraw bars) + vertical guide line with a dot snapped to the bar top
    if(_hoverMonth!==hit.m){_hoverMonth=hit.m;drawMonths();}
    const g=_monthGeom, vx=hit.x+hit.w/2;
    drawCrosshair('cvMonthsOv',g,vx,g?[{y:gY(g,hit.total),color:cssVar('--bd')}]:[]);
    if(tip){
      const items=monthBreakdown(currentYear,hit.m);
      let html='<div class="mtip-h">'+MONTHS[hit.m]+(currentYear!==THIS_YEAR?' '+currentYear:'')+
        ' \u00b7 <b>'+eurF(hit.total)+'</b></div>';
      if(items.length){html+='<div class="mtip-rows">'+items.map(it=>
        '<div class="mtip-row"><span>'+escapeHTML(it.name)+'</span><span>'+eurF(it.amt)+'</span></div>').join('')+'</div>';}
      else html+='<div class="mtip-empty">'+t('tip.noActiveCosts')+'</div>';
      tip.innerHTML=html;tip.hidden=false;
      const host=tip.offsetParent?tip.offsetParent.getBoundingClientRect():r;
      let left=ev.clientX-host.left+12, top=ev.clientY-host.top+12;
      if(left+220>host.width)left=ev.clientX-host.left-220-12;
      tip.style.left=Math.max(4,left)+'px';tip.style.top=top+'px';
    }
  });
  cv.addEventListener('mouseleave',clearAll);
}
function escapeHTML(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

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
  $('yearTag').textContent= y<THIS_YEAR?t('track.tag.past'):(y>THIS_YEAR?t('track.tag.planned'):t('track.tag.current'));
  $('yearTag').className='ytag '+(y<THIS_YEAR?'past':(y>THIS_YEAR?'future':'now'));
  renderExpenseTable();
}
function carryForward(){
  const target=currentYear+1;
  const src=getRows(currentYear);
  if(!Array.isArray(data.expenses[target]))data.expenses[target]=[];
  // --- merge group definitions by id (keep existing target groups, add any missing source groups) ---
  const tg=ensureGroups(target);
  getGroups(currentYear).forEach(g=>{
    if(!tg.some(x=>x.id===g.id))tg.push({id:g.id,name:g.name,collapsed:g.collapsed});
  });
  // --- merge expenses: append a carried row only if no same-name row already exists in the same group ---
  const tgtRows=data.expenses[target];
  const keyOf=e=>((e.groupId||'')+'\u0000'+(e.name||'').trim().toLowerCase());
  const present=new Set(tgtRows.map(keyOf));
  let added=0,skipped=0;
  src.forEach(e=>{const k=keyOf(e);
    if(present.has(k)){skipped++;return;}                 // same name+group already there -> discard carry
    present.add(k);added++;
    tgtRows.push({id:uid(),name:e.name,amount:e.amount,unit:e.unit,groupId:e.groupId||null,months:e.months.slice()});
  });
  // income: only fill if the target has none yet
  if(data.income[target]==null&&data.income[currentYear]!=null)data.income[target]=data.income[currentYear];
  persist();switchYear(target);
  setStatus(t('status.carried',{year:target,added:added,skipped:skipped?t('status.carried.skipped',{n:skipped}):''}),'ok');
}

/* ===================== SETTINGS (appearance, browser-local only) ===================== */
const SETTINGS_KEY='fd_settings', SETTINGS_VER=1;
const FONT_PAIRS={
  mono:{label:'Spline Sans Mono (default)', display:'"Spline Sans Mono",monospace', body:'"Spline Sans Mono",monospace', mono:'"Spline Sans Mono",monospace'},
  fraunces:{label:'Fraunces \u00b7 Spline Sans', display:'"Fraunces",serif', body:'"Spline Sans",sans-serif', mono:'"Spline Sans Mono",monospace'},
  sans:{label:'Spline Sans \u2014 clean sans', display:'"Spline Sans",sans-serif', body:'"Spline Sans",sans-serif', mono:'"Spline Sans Mono",monospace'},
  system:{label:'System serif \u00b7 system sans', display:'Georgia,"Times New Roman",serif', body:'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', mono:'ui-monospace,Menlo,Consolas,monospace'}
};
/* ===== Predefined colour profiles (primary = equity/positive, secondary = highlight) =====
   To change which profile ships as the default, edit DEFAULT_PROFILE below. */
const COLOR_PROFILES={
  orchid:    {label:'Orchid',    light:{eq:'#A923A5', bd:'#5D45D9'}, dark:{eq:'#c247be', bd:'#7d68e6'}},
  evergreen: {label:'Evergreen', light:{eq:'#1f6f54', bd:'#c2702c'}, dark:{eq:'#3fa882', bd:'#d98a45'}},
  azure:     {label:'Azure',     light:{eq:'#1f6fa6', bd:'#2c9c8e'}, dark:{eq:'#4f97d9', bd:'#45c2b0'}},
  ember:     {label:'Ember',     light:{eq:'#c2591f', bd:'#a8852a'}, dark:{eq:'#e07a3d', bd:'#dcb24d'}},
  berry:     {label:'Berry',     light:{eq:'#a8285f', bd:'#6a4b9c'}, dark:{eq:'#cc4f86', bd:'#9173cc'}},
  teal:      {label:'Teal',      light:{eq:'#0f8c84', bd:'#6f9c3c'}, dark:{eq:'#3fb8af', bd:'#93c05f'}},
  indigo:    {label:'Indigo',    light:{eq:'#4856c9', bd:'#8348b5'}, dark:{eq:'#7280ec', bd:'#a86fd6'}},
  honey:     {label:'Honey',     light:{eq:'#b88a1f', bd:'#7a5a2c'}, dark:{eq:'#dcab3d', bd:'#b48a4d'}},
  graphite:  {label:'Graphite',  light:{eq:'#5c6470', bd:'#8a7350'}, dark:{eq:'#9aa3b0', bd:'#b09472'}},
  moss:      {label:'Moss',      light:{eq:'#6f8f1f', bd:'#b07a2c'}, dark:{eq:'#9bb83f', bd:'#d49a4d'}}
};
const DEFAULT_PROFILE='teal';   // <-- the "default default" colour profile

const DEFAULT_USER_PROFILE={maritalStatus:'single', state:'', churchMember:false, hasChildren:false, taxClass:'', grossAmount:'', grossPeriod:'month'};
const DEFAULT_SETTINGS={version:SETTINGS_VER, themeMode:'dark', font:'fraunces', density:'comfortable',
  fileName:'finance_data.json',
  profile:DEFAULT_PROFILE,
  userProfile:DEFAULT_USER_PROFILE,
  changeWin:12,
  benchDetail:{contrib:true, glide:true, eqR:true, bdR:false, infl:false, fee:false},
  accents:{light:{eq:COLOR_PROFILES[DEFAULT_PROFILE].light.eq, bd:COLOR_PROFILES[DEFAULT_PROFILE].light.bd},
           dark:{eq:COLOR_PROFILES[DEFAULT_PROFILE].dark.eq,  bd:COLOR_PROFILES[DEFAULT_PROFILE].dark.bd}}};
function isHex(s){return typeof s==='string'&&/^#[0-9a-fA-F]{6}$/.test(s);}
function cloneDefaults(){return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));}
let settings=cloneDefaults();
function dataFileName(){let n=(settings&&settings.fileName||'finance_data.json').trim();
  if(!n)n='finance_data.json';if(!/\.json$/i.test(n))n+='.json';return n;}
function loadSettings(){
  try{const raw=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(!raw||typeof raw!=='object')return;
    if(['light','dark','auto'].indexOf(raw.themeMode)>=0)settings.themeMode=raw.themeMode;
    if(FONT_PAIRS[raw.font])settings.font=raw.font;
    if(['comfortable','compact'].indexOf(raw.density)>=0)settings.density=raw.density;
    if(typeof raw.fileName==='string'&&raw.fileName.trim())settings.fileName=raw.fileName.trim().slice(0,80);
    if(raw.profile===null||COLOR_PROFILES[raw.profile])settings.profile=raw.profile; // null = custom
    if(raw.userProfile&&typeof raw.userProfile==='object'){var up=raw.userProfile, P=settings.userProfile;
      if(['single','married'].indexOf(up.maritalStatus)>=0)P.maritalStatus=up.maritalStatus;
      if(typeof up.state==='string')P.state=up.state.slice(0,40);
      if(typeof up.churchMember==='boolean')P.churchMember=up.churchMember;
      if(typeof up.hasChildren==='boolean')P.hasChildren=up.hasChildren;
      if(['','I','II','III','IV','V','VI'].indexOf(up.taxClass)>=0)P.taxClass=up.taxClass;
      if(typeof up.grossAmount==='string'||typeof up.grossAmount==='number')P.grossAmount=String(up.grossAmount).slice(0,20);
      if(['month','year'].indexOf(up.grossPeriod)>=0)P.grossPeriod=up.grossPeriod;
    }
    if([6,12,24,36].indexOf(+raw.changeWin)>=0)settings.changeWin=+raw.changeWin;
    if(raw.benchDetail&&typeof raw.benchDetail==='object')
      Object.keys(settings.benchDetail).forEach(k=>{if(typeof raw.benchDetail[k]==='boolean')settings.benchDetail[k]=raw.benchDetail[k];});
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
function hexToHsl(hex){if(!isHex(hex))return null;const n=parseInt(hex.slice(1),16);
  let r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0,l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r)h=(g-b)/d+(g<b?6:0);else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;}
  return {h:h*360,s:s*100,l:l*100};}
function hslToHex(h,s,l){h=((h%360)+360)%360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let r,g,b;
  if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;}else if(h<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}
  const to=v=>{const k=Math.round((v+m)*255);return ('0'+k.toString(16)).slice(-2);};
  return '#'+to(r)+to(g)+to(b);}
// six harmonized category tints rotated around the primary accent's hue
function buildGroupTints(primaryHex,dark){
  const base=hexToHsl(primaryHex)||{h:300,s:60,l:45};
  const sat=dark?Math.max(45,base.s*0.85):Math.max(42,base.s*0.8);
  const lum=dark?58:42;
  const out=[];for(let i=0;i<6;i++){out.push(hslToHex(base.h+i*(360/6),sat,lum));}
  return out;
}
function systemPrefersDark(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}catch(e){return false;}}
function resolvedTheme(){return settings.themeMode==='auto'?(systemPrefersDark()?'dark':'light'):settings.themeMode;}
function rgbaFromHex(hex,a){if(!isHex(hex))return 'rgba(150,150,150,'+a+')';const n=parseInt(hex.slice(1),16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
function applyAccents(){
  const t=resolvedTheme(),a=settings.accents[t]||DEFAULT_SETTINGS.accents[t];
  const ds=document.documentElement.style, dark=(t==='dark');
  ds.setProperty('--eq',a.eq);ds.setProperty('--eq-soft',shade(a.eq,dark?0.18:0.14));
  ds.setProperty('--bd',a.bd);ds.setProperty('--good',a.eq);ds.setProperty('--warn',a.bd);
  // soft translucent washes (formerly hardcoded copper/green rgba literals)
  ds.setProperty('--eq-wash',rgbaFromHex(a.eq,dark?0.16:0.08));
  ds.setProperty('--bd-wash',rgbaFromHex(a.bd,dark?0.14:0.07));
  ds.setProperty('--eq-wash-strong',rgbaFromHex(a.eq,dark?0.20:0.12));
  // six harmonized group tints -> CSS vars --tint0..--tint5
  GROUP_TINTS=buildGroupTints(a.eq,dark);
  GROUP_TINTS.forEach((c,i)=>ds.setProperty('--tint'+i,c));
}
function applyThemeVisual(){
  const t=resolvedTheme();
  if(t==='dark')document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
  applyAccents(); // accents depend on the resolved theme, so re-apply after the theme attr
  // keep the browser/PWA chrome colour in sync with the actual app theme (not the system setting)
  const mt=$('metaTheme');if(mt)mt.setAttribute('content',t==='dark'?'#141310':'#f4efe6');
}
function applyFont(){const p=FONT_PAIRS[settings.font]||FONT_PAIRS.fraunces;const ds=document.documentElement.style;
  ds.setProperty('--f-display',p.display);ds.setProperty('--f-body',p.body);ds.setProperty('--f-mono',p.mono);}
function applyDensity(){document.documentElement.setAttribute('data-density',settings.density==='compact'?'compact':'comfortable');}
function repaintCanvases(){
  if($('tabPlan').style.display!=='none')render();
  else if($('tabInvest')&&$('tabInvest').style.display!=='none')renderInvest();
  else drawMonths();
}
function applySettings(){applyFont();applyDensity();applyThemeVisual();repaintCanvases();syncSettingsUI();}

// apply one of the predefined colour profiles (sets both light & dark accent pairs)
function applyProfile(key){
  const p=COLOR_PROFILES[key];if(!p)return;
  settings.profile=key;
  settings.accents={light:{eq:p.light.eq,bd:p.light.bd}, dark:{eq:p.dark.eq,bd:p.dark.bd}};
  saveSettings();applyAccents();
  if($('tabPlan').style.display==='none')renderExpenseTable(); // refresh inline group-tint borders
  repaintCanvases();syncSettingsUI();
}

/* settings panel open/close + control wiring */
/* ---- modal focus management (a11y floor): restore focus on close + Tab-trap inside ---- */
let _lastFocus=null;
function _focusables(panel){return Array.from(panel.querySelectorAll(
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
)).filter(el=>!el.hidden&&el.offsetParent!==null);}
function trapTab(panel,ev){if(ev.key!=='Tab'||!panel)return;const f=_focusables(panel);if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
  else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}
function captureFocus(){_lastFocus=document.activeElement;}
function restoreFocus(){try{if(_lastFocus&&_lastFocus.focus)_lastFocus.focus();}catch(e){}_lastFocus=null;}

function openSettings(){const o=$('setOvl');if(!o)return;captureFocus();o.hidden=false;requestAnimationFrame(()=>o.classList.add('open'));syncSettingsUI();const c=$('setClose');if(c)c.focus();}
function closeSettings(){const o=$('setOvl');if(!o)return;o.classList.remove('open');setTimeout(()=>{o.hidden=true;},220);restoreFocus();}

/* ===================== PROFILE (account, browser-local only) ===================== */
function churchRateFromProfile(p){if(!p||!p.churchMember)return 0;return (p.state==='Bayern'||p.state==='Baden-W\u00fcrttemberg')?0.08:0.09;}
function persistProfile(){saveSettings(); if(typeof _fhBuilt!=='undefined') _fhBuilt=false; /* FinHub re-seeds on next open */}
function syncProfileUI(){
  var p=(settings&&settings.userProfile)||{};
  function seg(id,val){var s=$(id);if(s)Array.prototype.forEach.call(s.children,function(b){b.classList.toggle('on',b.dataset.v===val);});}
  seg('profMarital',p.maritalStatus);
  seg('profChurch',p.churchMember?'yes':'no');
  seg('profChildren',p.hasChildren?'yes':'no');
  seg('profGrossPeriod',p.grossPeriod);
  var st=$('profState'); if(st&&document.activeElement!==st) st.value=p.state||'';
  var tc=$('profTaxClass'); if(tc&&document.activeElement!==tc) tc.value=p.taxClass||'';
  var g=$('profGross'); if(g&&document.activeElement!==g) g.value=p.grossAmount||'';
}
function openProfile(){var o=$('profOvl');if(!o)return;captureFocus();syncProfileUI();o.hidden=false;requestAnimationFrame(function(){o.classList.add('open');});var c=$('profClose');if(c)c.focus();}
function closeProfile(){var o=$('profOvl');if(!o)return;o.classList.remove('open');setTimeout(function(){o.hidden=true;},220);restoreFocus();}
function wireProfile(){
  var b=$('btnProfile'); if(b)b.addEventListener('click',openProfile);
  var c=$('profClose'); if(c)c.addEventListener('click',closeProfile);
  var o=$('profOvl'); if(o)o.addEventListener('click',function(ev){if(ev.target===o)closeProfile();});
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){var oo=$('profOvl');if(oo&&!oo.hidden)closeProfile();}});
  function setSeg(id,key,map){var s=$(id);if(!s)return;Array.prototype.forEach.call(s.children,function(btn){btn.addEventListener('click',function(){
    settings.userProfile[key]=map?map(btn.dataset.v):btn.dataset.v; persistProfile(); syncProfileUI();});});}
  setSeg('profMarital','maritalStatus');
  setSeg('profChurch','churchMember',function(v){return v==='yes';});
  setSeg('profChildren','hasChildren',function(v){return v==='yes';});
  setSeg('profGrossPeriod','grossPeriod');
  var st=$('profState'); if(st)st.addEventListener('change',function(){settings.userProfile.state=st.value;persistProfile();});
  var tc=$('profTaxClass'); if(tc)tc.addEventListener('change',function(){settings.userProfile.taxClass=tc.value;persistProfile();});
  var g=$('profGross'); if(g)g.addEventListener('input',function(){settings.userProfile.grossAmount=g.value;persistProfile();});
}

/* ===================== FINHUB INFO MODAL ===================== */
/* Content lives in self-registering modules in sources/ (window.FINHUB.tabs).
   Rendered lazily on first open using the dashboard's own classes so it tracks
   theme + density automatically. A "calc" section drives the interactive
   calculator; its 2026 figures come from the income-tax module's config. */
const TI_ICONS={
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  activity:'<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  sort:'<path d="M6 4v15M6 4l-3 3M6 4l3 3M13 6h7M13 11h5M13 16h3"/>',
  merge:'<path d="M8 6l4-3 4 3M12 3v7a7 7 0 0 0 7 7h1M12 10a7 7 0 0 1-7 7H4"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M14.6 9.4A2.4 2 0 0 0 12 8c-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.4 2 0 0 1 9.4 14.6"/>',
  receipt:'<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  percent:'<path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  building:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20a6 6 0 0 0-4-5.6"/>',
  car:'<path d="M4 13l1.8-5h12.4L20 13v5H4z"/><path d="M7 18v2M17 18v2"/><circle cx="7.5" cy="15.5" r="1"/><circle cx="16.5" cy="15.5" r="1"/>',
  home:'<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>',
  heart:'<path d="M12 20s-7-4.4-7-9a3.8 3.8 0 0 1 7-2 3.8 3.8 0 0 1 7 2c0 4.6-7 9-7 9z"/>',
  tool:'<path d="M14.5 6.5a3.5 3.5 0 0 0 4.5 4.5l-8 8-3-3 8-8z"/><path d="M5 19l3-3"/>'
};
function tiSvg(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '+
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(TI_ICONS[name]||'')+'</svg>';}
function tiFmt(s){return String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/\*([^*]+)\*/g,'<b>$1</b>')
  .replace(/_([^_]+)_/g,'<em>$1</em>');}

/* ---- numeric helpers (German formatting) ---- */
function fhEuro(x){return Math.round(x).toLocaleString('de-DE')+'\u00a0\u20ac';}
function fhPct(r){return (r*100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+'\u00a0%';}
function fhParse(str){if(str==null)return 0;var s=String(str).replace(/[^0-9,.\-]/g,'').replace(/\./g,'').replace(',','.');var v=parseFloat(s);return isFinite(v)?v:0;}

/* ---- §32a EStG tariff engine (coefficients supplied via config) ---- */
function fhBaseTax(zvE,t){
  var x=Math.floor(zvE);
  if(x<=t.grundfreibetrag) return 0;
  if(x<=t.zone2.upTo){var y=(x-t.grundfreibetrag)/10000; return Math.floor((t.zone2.a*y+t.zone2.b)*y);}
  if(x<=t.zone3.upTo){var z=(x-t.zone3.sub)/10000; return Math.floor((t.zone3.a*z+t.zone3.b)*z+t.zone3.c);}
  if(x<=t.zone4.upTo) return Math.floor(t.zone4.rate*x-t.zone4.sub);
  return Math.floor(t.zone5.rate*x-t.zone5.sub);
}
function fhIncomeTax(zvE,married,t){var z=Math.floor(Math.max(0,zvE)); return married? 2*fhBaseTax(Math.floor(z/2),t) : fhBaseTax(z,t);}
function fhMarginal(zvE,married,t){
  var base=married?Math.floor(Math.max(0,zvE)/2):Math.floor(Math.max(0,zvE));
  if(base<=t.grundfreibetrag) return 0;
  if(base<=t.zone2.upTo){var y=(base-t.grundfreibetrag)/10000; return (2*t.zone2.a*y+t.zone2.b)/10000;}
  if(base<=t.zone3.upTo){var z=(base-t.zone3.sub)/10000; return (2*t.zone3.a*z+t.zone3.b)/10000;}
  if(base<=t.zone4.upTo) return t.zone4.rate;
  return t.zone5.rate;
}
function fhSoli(est,married,cfg){var fg=married?cfg.soli.freigrenzeMarried:cfg.soli.freigrenzeSingle; if(est<=fg) return 0; return Math.min(cfg.soli.rate*est, cfg.soli.milderung*(est-fg));}
function fhGrossToZvE(gross,opts,cfg){
  var s=cfg.social, capRV=s.bbgRvAvMonthly*12, capKV=s.bbgKvPvMonthly*12;
  var bRV=Math.min(gross,capRV), bKV=Math.min(gross,capKV);
  var rv=bRV*s.rvEmployee, av=bRV*s.avEmployee;
  var zus=(opts.zusatz!=null?opts.zusatz:s.zusatzDefault);
  var kv=bKV*(s.kvBaseEmployee+zus/2);
  var pv=bKV*(s.pvEmployee+(opts.childless?s.pvChildlessExtra:0));
  var social=rv+av+kv+pv;
  var deductible=rv+kv+pv; /* unemployment usually yields no extra deduction */
  var zvE=Math.max(0, gross-deductible-cfg.lumpSums.werbungskosten-cfg.lumpSums.sonderausgaben);
  return {social:social, zvE:zvE};
}

/* ---- tab framework ---- */
var _fhBuilt=false, _fhCalcCfg=null;
function renderFinHub(){
  var host=$('infoBody'); if(!host) return;
  var F=window.FINHUB;
  var head=$('infoTitle'); if(head) head.textContent=(F&&F.title)||'FinHub';
  if(!F||!F.tabs||!F.tabs.length){host.innerHTML='<p class="ti-foot">No FinHub content loaded.</p>';return;}
  var strip=$('fhTabs');
  if(strip&&!_fhBuilt){
    strip.innerHTML=F.tabs.map(function(t,i){return '<button class="fh-tab'+(i===0?' active':'')+'" data-i="'+i+'">'+tiFmt(t.label||('Tab '+(i+1)))+'</button>';}).join('');
    strip.querySelectorAll('.fh-tab').forEach(function(b){b.addEventListener('click',function(){
      strip.querySelectorAll('.fh-tab').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active'); renderFinHubTab(parseInt(b.dataset.i,10)); host.scrollTop=0;
    });});
    _fhBuilt=true;
  }
  renderFinHubTab(0);
}
function renderFinHubTab(idx){
  var host=$('infoBody'); var F=window.FINHUB; if(!host||!F) return;
  var tab=F.tabs[idx]; if(!tab) return;
  _fhCalcCfg=null;
  // FinHub long-form prose is English for now (the technical terms are already German). Tell German
  // users honestly, once at the top, until the DE prose lands (post-1.0).
  var h=(typeof getLang==='function'&&getLang()==='de')
    ? '<div class="ti-box warn" style="margin-bottom:2px">'+escapeHTML(t('finhub.notice'))+'</div>' : '';
  h+='<div class="ti-sec">';
  if(tab.eyebrow)  h+='<p class="ti-label">'+tiFmt(tab.eyebrow)+'</p>';
  if(tab.title)    h+='<p class="ti-title" style="font-size:20px;margin-bottom:4px">'+tiFmt(tab.title)+'</p>';
  if(tab.subtitle) h+='<p class="d" style="color:var(--muted);font-size:13px;margin:0">'+tiFmt(tab.subtitle)+'</p>';
  h+='</div>';
  (tab.sections||[]).forEach(function(sec){
    h+='<div class="ti-sec">';
    if(sec.label) h+='<p class="ti-label">'+tiFmt(sec.label)+'</p>';
    if(sec.title) h+='<h3 class="ti-title">'+tiFmt(sec.title)+'</h3>';
    if(sec.kind==='calc'){ _fhCalcCfg=sec.config; h+='<div id="fhCalcMount"></div>'; }
    if(sec.metrics){
      h+='<div class="ti-metrics">';
      sec.metrics.forEach(function(m){h+='<div class="ti-metric"><div class="l">'+tiFmt(m.label)+'</div><div class="v">'+tiFmt(m.value)+'</div>'+(m.sub?'<div class="s">'+tiFmt(m.sub)+'</div>':'')+'</div>';});
      h+='</div>';
    }
    if(sec.note) h+='<div class="ti-card"><p>'+tiFmt(sec.note)+'</p></div>';
    if(sec.strategies){
      h+='<div class="ti-strats">';
      sec.strategies.forEach(function(s){h+='<div class="ti-strat'+(s.winner?' win':'')+'"><span class="ti-verdict '+(s.tone||'sub')+'">'+tiFmt(s.verdict)+'</span><p class="n">'+tiFmt(s.name)+'</p><p class="d">'+tiFmt(s.desc)+'</p></div>';});
      h+='</div>';
    }
    if(sec.tip)  h+='<div class="ti-box">'+tiFmt(sec.tip)+'</div>';
    if(sec.warn) h+='<div class="ti-box warn">'+tiFmt(sec.warn)+'</div>';
    if(sec.rules){
      h+='<div class="ti-card" style="padding:2px 14px">';
      sec.rules.forEach(function(r){h+='<div class="ti-rule">'+tiSvg(r.icon)+'<p>'+tiFmt(r.text)+'</p></div>';});
      h+='</div>';
    }
    if(sec.compare){
      h+='<div class="ti-compare">';
      sec.compare.forEach(function(c){h+='<div class="ti-comp"><span class="ti-verdict '+(c.tone||'sub')+'">'+tiFmt(c.badge)+'</span><p class="ct">'+tiFmt(c.title)+'</p>';(c.rows||[]).forEach(function(row){h+='<div class="cr"><span class="ck">'+tiFmt(row.key)+'</span><span class="cv">'+tiFmt(row.val)+'</span></div>';});h+='</div>';});
      h+='</div>';
    }
    h+='</div>';
  });
  host.innerHTML=h;
  if(_fhCalcCfg){ buildCalculator($('fhCalcMount'), _fhCalcCfg); }
}

/* ---- calculator UI ---- */
function buildCalculator(mount,cfg){
  if(!mount) return;
  var L18=t; // capture the i18n function before `t` is shadowed by `cfg.tariff` inside recompute()
  var churchOpts=(cfg.church&&cfg.church.options)||[{label:'None',rate:0}];
  mount.innerHTML=
    '<div class="fh-calc">'
    +'<div class="fh-seg">'
      +'<button class="fh-segbtn active" data-mode="taxable">'+escapeHTML(L18('fh.taxable'))+'</button>'
      +'<button class="fh-segbtn" data-mode="gross">'+escapeHTML(L18('fh.gross'))+'</button>'
    +'</div>'
    +'<div class="fh-row">'
      +'<label class="fh-field"><span>'+escapeHTML(L18('fh.amount'))+'</span><input id="fhAmount" type="text" inputmode="numeric" placeholder="z. B. 60.000"></label>'
      +'<div class="fh-seg fh-seg-sm"><button class="fh-segbtn active" data-period="year">'+escapeHTML(L18('fh.yearly'))+'</button><button class="fh-segbtn" data-period="month">'+escapeHTML(L18('fh.monthly'))+'</button></div>'
    +'</div>'
    +'<div class="fh-row fh-opts">'
      +'<label class="fh-chk"><input id="fhMarried" type="checkbox"><span>'+escapeHTML(L18('fh.married'))+'</span></label>'
      +'<label class="fh-chk fh-gross-only"><input id="fhChildless" type="checkbox"><span>'+escapeHTML(L18('fh.childless'))+'</span></label>'
      +'<label class="fh-field fh-sm"><span>'+escapeHTML(L18('fh.church'))+'</span><select id="fhChurch">'+churchOpts.map(function(o){return '<option value="'+escapeHTML(o.rate)+'">'+escapeHTML(o.label)+'</option>';}).join('')+'</select></label>'
      +'<label class="fh-field fh-sm fh-gross-only"><span>Zusatzbeitrag</span><input id="fhZusatz" type="text" inputmode="decimal" value="'+escapeHTML((cfg.social.zusatzDefault*100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}))+'"></label>'
    +'</div>'
    +'<div id="fhResult" class="fh-result"></div>'
    +'<p id="fhAssume" class="fh-assume fh-gross-only">'+escapeHTML(L18('fh.assume'))+'</p>'
    +'</div>';
  var state={mode:'taxable',period:'year'};
  function recompute(){
    var t=cfg.tariff;
    var amount=fhParse(($('fhAmount')||{}).value);
    var annual=state.period==='month'?amount*12:amount;
    var married=$('fhMarried').checked;
    var churchRate=parseFloat($('fhChurch').value)||0;
    var zvE, social=null;
    if(state.mode==='gross'){
      var childless=$('fhChildless').checked;
      var zus=fhParse($('fhZusatz').value)/100;
      var g=fhGrossToZvE(annual,{childless:childless,zusatz:isFinite(zus)?zus:cfg.social.zusatzDefault},cfg);
      zvE=g.zvE; social=g.social;
    } else { zvE=annual; }
    var est=fhIncomeTax(zvE,married,t);
    var soli=fhSoli(est,married,cfg);
    var church=churchRate>0?est*churchRate:0;
    var total=est+soli+church;
    var avg=zvE>0?est/zvE:0, marg=fhMarginal(zvE,married,t);
    var div=state.period==='month'?12:1, suf='\u00a0'+(state.period==='month'?L18('fh.suf.mo'):L18('fh.suf.yr'));
    function line(k,v,strong){return '<div class="fh-line'+(strong?' strong':'')+'"><span>'+escapeHTML(k)+'</span><span>'+v+'</span></div>';}
    var html='';
    if(state.mode==='gross'){
      html+=line(L18('fh.social'), fhEuro(social/div)+suf);
      html+=line(L18('fh.taxableEst'), fhEuro(zvE/div)+suf);
    }
    html+=line(L18('fh.incomeTax'), fhEuro(est/div)+suf);
    html+=line(L18('fh.soli'), fhEuro(soli/div)+suf);
    if(church>0) html+=line(L18('fh.churchTax'), fhEuro(church/div)+suf);
    html+=line(L18('fh.totalTax'), fhEuro(total/div)+suf, true);
    if(state.mode==='gross'){ html+=line(L18('fh.netEst'), fhEuro((annual-(social||0)-total)/div)+suf, true); }
    html+='<div class="fh-rates"><span>'+escapeHTML(L18('fh.avgRate'))+' '+fhPct(avg)+'</span><span>'+escapeHTML(L18('fh.margRate'))+' '+fhPct(marg)+'</span></div>';
    $('fhResult').innerHTML=html;
  }
  mount.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){
    state.mode=b.dataset.mode;
    mount.querySelectorAll('[data-mode]').forEach(function(x){x.classList.toggle('active',x===b);});
    mount.querySelector('.fh-calc').classList.toggle('is-gross',state.mode==='gross');
    recompute();
  });});
  mount.querySelectorAll('[data-period]').forEach(function(b){b.addEventListener('click',function(){
    state.period=b.dataset.period;
    mount.querySelectorAll('[data-period]').forEach(function(x){x.classList.toggle('active',x===b);});
    recompute();
  });});
  ['fhAmount','fhZusatz'].forEach(function(id){var el=$(id); if(el) el.addEventListener('input',recompute);});
  ['fhMarried','fhChildless','fhChurch'].forEach(function(id){var el=$(id); if(el) el.addEventListener('change',recompute);});
  /* seed from local profile, if any */
  var prof=(typeof settings!=='undefined'&&settings&&settings.userProfile)?settings.userProfile:null;
  if(prof){
    if(prof.maritalStatus==='married'){var mm=$('fhMarried');if(mm)mm.checked=true;}
    var cr=churchRateFromProfile(prof), sel=$('fhChurch');
    if(sel){for(var ci=0;ci<sel.options.length;ci++){if(parseFloat(sel.options[ci].value)===cr){sel.selectedIndex=ci;break;}}}
    var cl=$('fhChildless'); if(cl) cl.checked=(prof.hasChildren!==true);
    var gv=fhParse(prof.grossAmount);
    if(gv>0){
      state.mode='gross'; state.period=(prof.grossPeriod==='year'?'year':'month');
      var calcEl=mount.querySelector('.fh-calc'); if(calcEl)calcEl.classList.add('is-gross');
      mount.querySelectorAll('[data-mode]').forEach(function(x){x.classList.toggle('active',x.dataset.mode==='gross');});
      mount.querySelectorAll('[data-period]').forEach(function(x){x.classList.toggle('active',x.dataset.period===state.period);});
      var amt=$('fhAmount'); if(amt) amt.value=Math.round(gv).toLocaleString('de-DE');
    }
  }
  recompute();
}

function openInfo(){var o=$('infoOvl');if(!o)return;captureFocus();if(!_fhBuilt)renderFinHub();o.hidden=false;requestAnimationFrame(function(){o.classList.add('open');});var c=$('infoClose');if(c)c.focus();}
function closeInfo(){var o=$('infoOvl');if(!o)return;o.classList.remove('open');setTimeout(function(){o.hidden=true;},220);restoreFocus();}
function wireInfo(){
  var b=$('btnInfo');if(b)b.addEventListener('click',openInfo);
  var c=$('infoClose');if(c)c.addEventListener('click',closeInfo);
  var o=$('infoOvl');if(o)o.addEventListener('click',function(ev){if(ev.target===o)closeInfo();});
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){var oo=$('infoOvl');if(oo&&!oo.hidden)closeInfo();}});
}
function buildProfileOptions(){
  const host=$('setProfiles');if(!host)return;host.innerHTML='';
  const t=resolvedTheme();
  Object.keys(COLOR_PROFILES).forEach(k=>{
    const p=COLOR_PROFILES[k], a=p[t]||p.light;
    const b=document.createElement('button');b.className='profbtn';b.dataset.k=k;
    b.title='Use the '+p.label+' colour profile';
    b.innerHTML='<span class="profsw"><i style="background:'+a.eq+'"></i><i style="background:'+a.bd+'"></i></span>'+
      '<span class="proflab">'+p.label+'</span>';
    host.appendChild(b);
  });
}
function setSettingsPane(p){
  const tb=$('setTabs');if(tb)Array.from(tb.children).forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  const a=$('setPaneAppearance'),c=$('setPaneContent');
  if(a)a.hidden=(p!=='appearance');if(c)c.hidden=(p!=='content');
}
function syncSettingsUI(){
  const lg=$('setLang');if(lg&&typeof getLang==='function')Array.from(lg.children).forEach(b=>b.classList.toggle('on',b.dataset.v===getLang()));
  const seg=$('setTheme');if(seg)Array.from(seg.children).forEach(b=>b.classList.toggle('on',b.dataset.v===settings.themeMode));
  const den=$('setDensity');if(den)Array.from(den.children).forEach(b=>b.classList.toggle('on',b.dataset.v===settings.density));
  const f=$('setFont');if(f)f.value=settings.font;
  const fn=$('setFileName');if(fn&&document.activeElement!==fn)fn.value=settings.fileName||'finance_data.json';
  buildProfileOptions(); // rebuild so swatch previews track the active theme
  const prof=$('setProfiles');if(prof)Array.from(prof.children).forEach(b=>b.classList.toggle('on',b.dataset.k===settings.profile));
  const map={accLightEq:['light','eq'],accLightBd:['light','bd'],accDarkEq:['dark','eq'],accDarkBd:['dark','bd']};
  Object.keys(map).forEach(id=>{const el=$(id);if(el)el.value=settings.accents[map[id][0]][map[id][1]];});
  // content pane
  const cw=$('setChangeWin');if(cw)Array.from(cw.children).forEach(b=>b.classList.toggle('on',+b.dataset.v===settings.changeWin));
  const bd=$('setBenchDetail');if(bd)Array.from(bd.querySelectorAll('input[type=checkbox]')).forEach(c=>{c.checked=!!settings.benchDetail[c.dataset.k];});
  syncLockUI();
}
function buildFontOptions(){const f=$('setFont');if(!f)return;f.innerHTML='';
  Object.keys(FONT_PAIRS).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=FONT_PAIRS[k].label;f.appendChild(o);});}
function wireSettings(){
  const gear=$('btnSettings');if(gear)gear.addEventListener('click',openSettings);
  const cl=$('setClose');if(cl)cl.addEventListener('click',closeSettings);
  const ovl=$('setOvl');if(ovl)ovl.addEventListener('click',ev=>{if(ev.target===ovl)closeSettings();});
  const tb=$('setTabs');if(tb)tb.addEventListener('click',ev=>{const p=ev.target&&ev.target.dataset?ev.target.dataset.p:null;if(p)setSettingsPane(p);});
  const lg=$('setLang');if(lg)lg.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?ev.target.dataset.v:null;
    if(v&&typeof setLang==='function')setLang(v);});
  const seg=$('setTheme');if(seg)seg.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?ev.target.dataset.v:null;
    if(!v)return;settings.themeMode=v;saveSettings();applyThemeVisual();repaintCanvases();syncSettingsUI();});
  const den=$('setDensity');if(den)den.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?ev.target.dataset.v:null;
    if(!v)return;settings.density=v;saveSettings();applyDensity();repaintCanvases();syncSettingsUI();});
  // colour profiles (event-delegated; buttons are rebuilt on theme change)
  const prof=$('setProfiles');if(prof)prof.addEventListener('click',ev=>{
    let el=ev.target;while(el&&el!==prof&&!el.dataset.k)el=el.parentNode;
    if(el&&el.dataset&&el.dataset.k)applyProfile(el.dataset.k);});
  buildFontOptions();
  const f=$('setFont');if(f)f.addEventListener('change',()=>{settings.font=f.value;saveSettings();applyFont();repaintCanvases();});
  const map={accLightEq:['light','eq'],accLightBd:['light','bd'],accDarkEq:['dark','eq'],accDarkBd:['dark','bd']};
  Object.keys(map).forEach(id=>{const el=$(id);if(!el)return;
    el.addEventListener('input',()=>{const v=el.value;if(!isHex(v))return;settings.accents[map[id][0]][map[id][1]]=v;
      settings.profile=null; // manual edit => no longer a named profile
      saveSettings();applyAccents();
      if($('tabPlan').style.display==='none')renderExpenseTable(); // refresh inline group-tint borders
      repaintCanvases();syncSettingsUI();});});
  const fn=$('setFileName');if(fn)fn.addEventListener('input',()=>{settings.fileName=fn.value.trim().slice(0,80)||'finance_data.json';saveSettings();});
  // content: months-shown window
  const cw=$('setChangeWin');if(cw)cw.addEventListener('click',ev=>{const v=ev.target&&ev.target.dataset?+ev.target.dataset.v:0;
    if(!v)return;settings.changeWin=v;changeOffset=0;saveSettings();syncSettingsUI();
    if($('tabInvest')&&$('tabInvest').style.display!=='none')renderInvest();});
  // content: benchmark detail toggles
  const bd=$('setBenchDetail');if(bd)bd.addEventListener('change',ev=>{const c=ev.target;if(!c||!c.dataset||!c.dataset.k)return;
    settings.benchDetail[c.dataset.k]=!!c.checked;saveSettings();refreshBenchLabel();
    if($('tabInvest')&&$('tabInvest').style.display!=='none')renderInvest();});
  const rst=$('setReset');if(rst)rst.addEventListener('click',()=>{settings=cloneDefaults();
    try{localStorage.removeItem(SETTINGS_KEY);}catch(e){}applySettings();
    if($('tabPlan').style.display==='none')renderExpenseTable();});
  const clr=$('dataClear');if(clr)clr.addEventListener('click',()=>{
    if(!confirm(t('confirm.clearData')))return;
    snapshotBeforeReplace();                 // recoverable via the Undo toast below
    fileHandle=null;                         // drop the link so we don't re-save the cleared state onto a file
    Promise.all([FDStore.clear(),forgetHandle()]).then(()=>{
      // reset in place (no full reload) so we can offer a one-tap Undo
      data={version:SCHEMA, projection:null, income:{}, groupsByYear:{}, expenses:{}, securities:null};
      ensureSecurities();reconcileSecurities();
      const seeds=(typeof tList==='function'&&tList('seed.groups').length)?tList('seed.groups'):['Housing','Subscriptions','Insurance'];
      seeds.forEach(n=>addGroup(THIS_YEAR,n));
      try{localStorage.removeItem('kontor_onboarded');}catch(e){}
      currentYear=THIS_YEAR;buildYearStrip();switchYear(currentYear);
      if($('tabPlan')&&$('tabPlan').style.display!=='none')render();else renderExpenseTable();
      closeSettings();showWelcomeIfNew();
      showToast(t('status.cleared'), t('common.undo'), restoreSnapshot);
    });});
  wireLock();   // app lock (v1.2): enable / change PIN / biometric / disable
  // react to system theme changes when in auto mode
  try{const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
    if(mq){const h=()=>{if(settings.themeMode==='auto'){applyThemeVisual();repaintCanvases();}};
      if(mq.addEventListener)mq.addEventListener('change',h);else if(mq.addListener)mq.addListener(h);}}catch(e){}
}

/* ============================== TABS =============================== */
function showTab(which){
  const tabs={track:'tabTrack', invest:'tabInvest', plan:'tabPlan'};
  const btns={track:'btnTrack', invest:'btnInvest', plan:'btnPlan'};
  Object.keys(tabs).forEach(k=>{const t=$(tabs[k]);if(t)t.style.display=(k===which)?'':'none';
    const b=$(btns[k]);if(b)b.classList.toggle('on',k===which);});
  if(typeof applySplits==='function')applySplits(); // now-visible main has a real width to clamp against
  if(which==='plan'){render();if(typeof fitHGroupHeight==='function')requestAnimationFrame(fitHGroupHeight);}
  else if(which==='invest'){renderInvest();if(typeof layoutVGroup==='function')requestAnimationFrame(layoutVGroup);}
  else renderExpenseTable();
}

/* ----- touch: swipe horizontally to move between Track / Portfolio / Forecast ----- */
function wireSwipe(){
  const order=['track','invest','plan'];           // left→right tab order (Track · Portfolio · Forecast)
  const ids={track:'tabTrack',invest:'tabInvest',plan:'tabPlan'};
  function currentIdx(){for(let i=0;i<order.length;i++){const el=$(ids[order[i]]);if(el&&el.style.display!=='none')return i;}return 0;}
  // don't hijack horizontal scrollers, charts, drag handles, or form controls
  function blocked(el){let n=el;while(n&&n!==document.body){
    if(n.tagName&&/^(INPUT|TEXTAREA|SELECT|CANVAS)$/.test(n.tagName))return true;
    const c=n.classList;
    if(c&&(c.contains('xscroll')||c.contains('movesel')||c.contains('mgrid')||c.contains('seg')||
           c.contains('hgroup')||c.contains('vgroup')||c.contains('gutter')||c.contains('hgdiv')||
           c.contains('vgdiv')||c.contains('charthost')||c.contains('ovl')))return true;
    n=n.parentNode;} return false;}
  function modalOpen(){return ['setOvl','profOvl','infoOvl'].some(id=>{const o=$(id);return o&&!o.hidden;});}
  let sx=0,sy=0,live=false;
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||modalOpen()||blocked(e.target)){live=false;return;}
    sx=e.touches[0].clientX;sy=e.touches[0].clientY;live=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!live)return;live=false;
    const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.6)return;   // clear horizontal swipe only
    const i=currentIdx(),ni=dx<0?Math.min(order.length-1,i+1):Math.max(0,i-1);
    if(ni===i)return;
    showTab(order[ni]);
    const el=$(ids[order[ni]]);
    if(el){el.classList.remove('slidein-l','slidein-r');void el.offsetWidth;el.classList.add(dx<0?'slidein-r':'slidein-l');}
  },{passive:true});
}

/* ===================== LAYOUT ===================== */
const TABORDER_KEY='fd_taborder', SPLIT_KEY='fd_splits';
const HWEIGHT_KEY='fd_hweights', HGH_KEY='fd_hgh', HORDER_KEY='fd_horder';
const VHEIGHT_KEY='fd_vheights', VORDER_KEY='fd_vorder';
const CHARTH_DEFAULT=300; let chartH=CHARTH_DEFAULT; function getChartH(){return chartH;} // fallback only
function lsGet(k){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v;}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* ---- tab reordering (unchanged) ---- */
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

/* ---- Track tab: 2-column splitter (unchanged) ---- */
const LAYOUT_MIN={mainTrack:[300,920]};
let splits={};try{splits=JSON.parse(localStorage.getItem(SPLIT_KEY)||'{}')||{};}catch(e){splits={};}
const DEFAULT_LEFT={mainTrack:48};
function clampLeftPct(id, pct, mainW){
  const mins=LAYOUT_MIN[id]||[200,200];
  if(!mainW||mainW<=0)return pct;
  const minPct=(mins[0]/mainW)*100, maxPct=((mainW-14-mins[1])/mainW)*100;
  if(maxPct<minPct)return Math.max(0,Math.min(100,(minPct+maxPct)/2));
  return Math.max(minPct,Math.min(maxPct,pct));
}
function applySplits(){const id='mainTrack';const m=$(id);if(!m)return;
  const base=(splits[id]!=null)?splits[id]:DEFAULT_LEFT[id];
  const w=m.getBoundingClientRect?m.getBoundingClientRect().width:0;if(!w)return;
  m.style.setProperty('--leftw',clampLeftPct(id,base,w)+'%');}
function reclampSplits(){applySplits();layoutHGroup();layoutVGroup();}
function wireSplitter(gutter){
  const main=gutter.parentNode;if(!main||main.id!=='mainTrack')return;const id=main.id;let dragging=false,raf=0;
  const redraw=()=>{drawMonths();};
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

/* ============ Sandbox horizontal tile group (#mainPlan) ============ */
const HG_TILES=['planAssume','planChart','planControls','planOutlook'];
const HG_MIN={planAssume:190, planChart:300, planControls:210, planOutlook:210};
const HG_DEFW={planAssume:1.05, planChart:2.4, planControls:1.15, planOutlook:1.25};
const HGH_MIN=320, HGH_MAX=860;
let hWeights=Object.assign({},HG_DEFW,lsGet(HWEIGHT_KEY)||{});
let hOrder=(function(){const o=lsGet(HORDER_KEY);return (Array.isArray(o)&&o.length===HG_TILES.length&&HG_TILES.every(id=>o.indexOf(id)>=0))?o:HG_TILES.slice();})();
let hgh=(function(){const v=+lsGet(HGH_KEY);return (v>=HGH_MIN&&v<=HGH_MAX)?v:470;})();
function layoutHGroup(){
  const m=$('mainPlan');if(!m)return;
  m.style.setProperty('--hgh',hgh+'px');
  Array.from(m.querySelectorAll('.hgdiv')).forEach(d=>d.remove());
  hOrder.forEach((id,i)=>{const t=$(id);if(!t)return;
    m.appendChild(t);
    t.style.flex=(hWeights[id]||1)+' 1 0';t.style.minWidth=(HG_MIN[id]||180)+'px';
    if(i<hOrder.length-1){const d=document.createElement('div');d.className='hgdiv';
      d.dataset.left=id;d.dataset.right=hOrder[i+1];wireHGDiv(d);m.appendChild(d);}});
}
// smallest group height at which no tile needs a vertical scrollbar (probe with the row un-stretched)
function hgroupNaturalH(){
  const m=$('mainPlan');if(!m)return 0;
  const prevH=m.style.height, prevAI=m.style.alignItems;
  m.style.height='auto';m.style.alignItems='flex-start';     // let each tile take its content height
  let mx=0;HG_TILES.forEach(id=>{const t=$(id);if(t)mx=Math.max(mx,t.offsetHeight);});
  m.style.height=prevH;m.style.alignItems=prevAI;
  return Math.ceil(mx)+2;
}
function fitHGroupHeight(){const need=hgroupNaturalH();if(need>hgh){hgh=Math.min(HGH_MAX,need);
  const m=$('mainPlan');if(m)m.style.setProperty('--hgh',hgh+'px');lsSet(HGH_KEY,Math.round(hgh));}}
function wireHGDiv(d){
  let dragging=false,startX=0,wL=0,wR=0,perGrow=1,raf=0;
  d.addEventListener('pointerdown',ev=>{const m=$('mainPlan');const L=$(d.dataset.left),R=$(d.dataset.right);if(!m||!L||!R)return;
    dragging=true;d.classList.add('dragging');if(d.setPointerCapture)d.setPointerCapture(ev.pointerId);ev.preventDefault();
    startX=ev.clientX;wL=hWeights[d.dataset.left]||1;wR=hWeights[d.dataset.right]||1;
    let sum=0;hOrder.forEach(id=>sum+=(hWeights[id]||1));
    perGrow=(m.getBoundingClientRect().width)/(sum||1);});
  d.addEventListener('pointermove',ev=>{if(!dragging)return;
    const dpx=ev.clientX-startX, dG=dpx/(perGrow||1);
    const minGL=(HG_MIN[d.dataset.left]||180)/(perGrow||1), minGR=(HG_MIN[d.dataset.right]||180)/(perGrow||1);
    let nL=wL+dG, nR=wR-dG;
    if(nL<minGL){nR-=(minGL-nL);nL=minGL;} if(nR<minGR){nL-=(minGR-nR);nR=minGR;}
    if(nL<minGL)nL=minGL;
    hWeights[d.dataset.left]=nL;hWeights[d.dataset.right]=nR;
    const L=$(d.dataset.left),R=$(d.dataset.right);if(L)L.style.flex=nL+' 1 0';if(R)R.style.flex=nR+' 1 0';
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;fitHGroupHeight();drawLife(computeModel(P()));});}); // grow to fit -> no scroll
  function end(ev){if(!dragging)return;dragging=false;d.classList.remove('dragging');
    if(d.releasePointerCapture&&ev&&ev.pointerId!=null)try{d.releasePointerCapture(ev.pointerId);}catch(e){}
    fitHGroupHeight();lsSet(HWEIGHT_KEY,hWeights);render();}
  d.addEventListener('pointerup',end);d.addEventListener('pointercancel',end);
  d.addEventListener('dblclick',()=>{hWeights=Object.assign({},HG_DEFW);lsSet(HWEIGHT_KEY,hWeights);layoutHGroup();fitHGroupHeight();render();});
}
// group height via #vgPlan
function wireGroupHeight(vg){
  let dragging=false,startY=0,startH=0,minH=HGH_MIN,raf=0;
  vg.addEventListener('pointerdown',ev=>{dragging=true;startY=ev.clientY;startH=hgh;
    minH=Math.max(HGH_MIN,hgroupNaturalH());                  // can't drag above what the tiles need -> no scroll
    vg.classList.add('dragging');if(vg.setPointerCapture)vg.setPointerCapture(ev.pointerId);ev.preventDefault();});
  vg.addEventListener('pointermove',ev=>{if(!dragging)return;
    hgh=Math.max(minH,Math.min(HGH_MAX,startH+(ev.clientY-startY)));
    const m=$('mainPlan');if(m)m.style.setProperty('--hgh',hgh+'px');
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;drawLife(computeModel(P()));});});
  function end(ev){if(!dragging)return;dragging=false;vg.classList.remove('dragging');
    if(vg.releasePointerCapture&&ev&&ev.pointerId!=null)try{vg.releasePointerCapture(ev.pointerId);}catch(e){}
    lsSet(HGH_KEY,Math.round(hgh));render();}
  vg.addEventListener('pointerup',end);vg.addEventListener('pointercancel',end);
  vg.addEventListener('dblclick',()=>{hgh=470;lsSet(HGH_KEY,hgh);const m=$('mainPlan');if(m)m.style.setProperty('--hgh',hgh+'px');render();});
}

/* ============ Plan vertical tile group (#mainInvest) ============ */
const VG_TILES=['invAccount','invChange','invLedger'];
const VG_MIN={invAccount:240, invChange:200, invLedger:200};
const VG_DEFH={invAccount:540, invChange:250, invLedger:340};
let vHeights=Object.assign({},VG_DEFH,lsGet(VHEIGHT_KEY)||{});
let vOrder=(function(){const o=lsGet(VORDER_KEY);return (Array.isArray(o)&&o.length===VG_TILES.length&&VG_TILES.every(id=>o.indexOf(id)>=0))?o:VG_TILES.slice();})();
// natural content height of a tile, independent of its current (possibly stretched) box height
function tileNaturalH(t){if(!t)return 0;const pv=t.style.height,po=t.style.overflow;
  t.style.height='auto';t.style.overflow='visible';const h=t.offsetHeight;t.style.height=pv;t.style.overflow=po;return h;}
function layoutVGroup(){
  const m=$('mainInvest');if(!m)return;
  Array.from(m.querySelectorAll('.vgdiv,.vgspace')).forEach(d=>d.remove());
  vOrder.forEach((id,i)=>{const t=$(id);if(!t)return;
    m.appendChild(t);
    const contentSized=(id==='invLedger');                 // ledger always grows to fit its rows (item: no scroll)
    if(contentSized){t.style.height='auto';t.style.overflow='visible';}
    else{t.style.overflow='auto';
      const want=(vHeights[id]||VG_DEFH[id]||260);
      const need=tileNaturalH(t)+2;                        // content height at the CURRENT width
      t.style.height=Math.max(want,need)+'px';}            // never below content -> no scrollbar after a resize
    if(i<vOrder.length-1){
      if(contentSized){const sp=document.createElement('div');sp.className='vgspace';m.appendChild(sp);}
      else{const d=document.createElement('div');d.className='vgdiv';d.dataset.above=id;wireVGDiv(d);m.appendChild(d);}}});
  requestAnimationFrame(()=>{drawInvestValue();drawInvestGain();});
}
function wireVGDiv(d){
  let dragging=false,startY=0,startH=0,cMin=0,raf=0;
  d.addEventListener('pointerdown',ev=>{const id=d.dataset.above,t=$(id);if(!t)return;
    dragging=true;startY=ev.clientY;startH=vHeights[id]||VG_DEFH[id]||260;
    cMin=Math.max(VG_MIN[id]||160, tileNaturalH(t)+2);       // can't shrink below content -> never scrolls
    d.classList.add('dragging');if(d.setPointerCapture)d.setPointerCapture(ev.pointerId);ev.preventDefault();});
  d.addEventListener('pointermove',ev=>{if(!dragging)return;const id=d.dataset.above;
    const nh=Math.max(cMin,startH+(ev.clientY-startY));vHeights[id]=nh;
    const t=$(id);if(t)t.style.height=nh+'px';
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;drawInvestValue();drawInvestGain();});});
  function end(ev){if(!dragging)return;dragging=false;d.classList.remove('dragging');
    if(d.releasePointerCapture&&ev&&ev.pointerId!=null)try{d.releasePointerCapture(ev.pointerId);}catch(e){}
    lsSet(VHEIGHT_KEY,vHeights);requestAnimationFrame(()=>{drawInvestValue();drawInvestGain();});}
  d.addEventListener('pointerup',end);d.addEventListener('pointercancel',end);
  d.addEventListener('dblclick',()=>{const id=d.dataset.above,t=$(id);
    const def=Math.max(VG_DEFH[id]||260, t?tileNaturalH(t)+2:0);vHeights[id]=def;lsSet(VHEIGHT_KEY,vHeights);
    if(t)t.style.height=def+'px';requestAnimationFrame(()=>{drawInvestValue();drawInvestGain();});});
}

/* ---- generic grip-drag tile reordering (works for hgroup & vgroup) ---- */
let _tileDrag=null;
function startTileReorder(ev,panel,groupId,orientation,onDone){
  ev.preventDefault();
  _tileDrag={panel,groupId,orientation,onDone,line:ensureDropLine(),moved:false,beforeId:null};
  panel.classList.add('tiledrag');
  const move=e=>onTileReorderMove(e);
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);finishTileReorder();};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
}
function onTileReorderMove(ev){
  if(!_tileDrag)return;_tileDrag.moved=true;
  const m=$(_tileDrag.groupId);if(!m)return;const ln=_tileDrag.line;const horiz=_tileDrag.orientation==='h';
  const tiles=Array.from(m.children).filter(c=>c.classList&&c.classList.contains('panel')&&c!==_tileDrag.panel);
  let best=null,bestDist=Infinity,before=true;
  tiles.forEach(t=>{const r=t.getBoundingClientRect();const mid=horiz?(r.left+r.width/2):(r.top+r.height/2);
    const pos=horiz?ev.clientX:ev.clientY;const dd=Math.abs(pos-mid);
    if(dd<bestDist){bestDist=dd;best=t;before=pos<mid;}});
  if(!best){ln.hidden=true;_tileDrag.beforeId=null;return;}
  const r=best.getBoundingClientRect();
  _tileDrag.beforeId=before?best.id:null;_tileDrag.afterId=before?null:best.id;
  if(horiz){ln.style.left=((before?r.left:r.right)-1)+'px';ln.style.top=r.top+'px';ln.style.width='2px';ln.style.height=r.height+'px';}
  else{ln.style.left=r.left+'px';ln.style.top=((before?r.top:r.bottom)-1)+'px';ln.style.width=r.width+'px';ln.style.height='2px';}
  ln.hidden=false;
}
function finishTileReorder(){
  if(!_tileDrag)return;const t=_tileDrag;if(t.line){t.line.hidden=true;t.line.style.height='2px';}
  t.panel.classList.remove('tiledrag');
  const done=t.onDone,moved=t.moved,pid=t.panel.id,beforeId=t.beforeId,afterId=t.afterId;_tileDrag=null;
  if(moved&&done)done(pid,beforeId,afterId);
}
function reorderArray(arr,id,beforeId,afterId){
  const a=arr.filter(x=>x!==id);
  if(beforeId){const i=a.indexOf(beforeId);a.splice(i<0?a.length:i,0,id);}
  else if(afterId){const i=a.indexOf(afterId);a.splice(i<0?a.length:i+1,0,id);}
  else a.push(id);
  return a;
}
function wireHGroupReorder(){const m=$('mainPlan');if(!m)return;
  HG_TILES.forEach(id=>{const p=$(id);if(!p)return;const grip=p.querySelector?p.querySelector('.tilegrip'):null;if(!grip)return;
    grip.addEventListener('pointerdown',ev=>startTileReorder(ev,p,'mainPlan','h',(pid,b,a)=>{
      hOrder=reorderArray(hOrder,pid,b,a);lsSet(HORDER_KEY,hOrder);layoutHGroup();render();}));});}
function wireVGroupReorder(){const m=$('mainInvest');if(!m)return;
  VG_TILES.forEach(id=>{const p=$(id);if(!p)return;const grip=p.querySelector?p.querySelector('.tilegrip'):null;if(!grip)return;
    grip.addEventListener('pointerdown',ev=>startTileReorder(ev,p,'mainInvest','v',(pid,b,a)=>{
      vOrder=reorderArray(vOrder,pid,b,a);lsSet(VORDER_KEY,vOrder);layoutVGroup();}));});}

function wireLayout(){
  applyTabOrder();wireTabDnD();
  layoutHGroup();wireHGroupReorder();
  layoutVGroup();wireVGroupReorder();
  applySplits();
  (document.querySelectorAll('.gutter')||[]).forEach(wireSplitter);
  const vg=$('vgPlan');if(vg)wireGroupHeight(vg);
}

/* ============================== WIRING ============================= */
function wire(){
  // Plan controls (behaviour unchanged)
  document.querySelectorAll('#tabPlan input[type=range]').forEach(el=>el.addEventListener('input',render));
  $('spb').addEventListener('change',render);
  // mark the verdict "ready" once the user actually sets their income and monthly saving
  ['inc','incN'].forEach(id=>{const e=$(id);if(e)e.addEventListener('input',()=>{markForecastTouched('income');render();});});
  ['contrib','contribN'].forEach(id=>{const e=$(id);if(e)e.addEventListener('input',()=>{markForecastTouched('saving');render();});});
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

  // Investment (real "Plan" tab) controls
  const sb=$('secStartBalN');if(sb)sb.addEventListener('input',()=>{const s=ensureSecurities();
    const v=parseNum(sb.value);s.startBalance=isNaN(v)?0:v;renderInvest();render();persist();});
  const ss=$('secSince');if(ss)ss.addEventListener('change',()=>{const s=ensureSecurities();
    let v=ss.value;if(/^\d{4}-\d{2}$/.test(v)){if(ymCompare(v,thisYM())>0)v=thisYM();s.startMonth=v;
      reconcileSecurities();renderInvest();render();persist();}});
  const rec=$('invRecord');if(rec)rec.addEventListener('click',recordThisMonth);
  const bset=$('invBenchSet');if(bset)bset.addEventListener('click',setBenchmarkFromSandbox);
  const bclr=$('invBenchClear');if(bclr)bclr.addEventListener('click',clearBenchmark);
  const cprev=$('invChangePrev');if(cprev)cprev.addEventListener('click',()=>shiftChangeWindow(6));   // older
  const cnext=$('invChangeNext');if(cnext)cnext.addEventListener('click',()=>shiftChangeWindow(-6));  // newer
  const more=$('invLedMore');if(more)more.addEventListener('click',()=>{invLedExpanded=!invLedExpanded;buildInvestLedger();});

  // Tabs
  $('btnPlan').addEventListener('click',()=>showTab('plan'));
  $('btnInvest').addEventListener('click',()=>showTab('invest'));
  $('btnTrack').addEventListener('click',()=>showTab('track'));

  // Theme + settings
  // theme toggle lives in Settings now (header button removed)
  wireSettings();
  wireInfo();
  wireProfile();

  // Track: year nav
  $('yearSel').addEventListener('change',e=>switchYear(+e.target.value));
  $('yPrev').addEventListener('click',()=>switchYear(currentYear-1));
  $('yNext').addEventListener('click',()=>switchYear(currentYear+1));
  $('carry').addEventListener('click',carryForward);

  // Track: add expense
  $('addExp').addEventListener('click',()=>{const ne={id:uid(),name:'',amount:0,unit:'month',groupId:null,months:Array(12).fill(true)};
    getRows(currentYear).push(ne);renderExpenseTable();persist();
    const r=$('expBody').querySelector('tr[data-id="'+ne.id+'"]');if(r){const t=r.querySelector('.name');if(t)t.focus();}});
  $('addGroup').addEventListener('click',()=>{const g=addGroup(currentYear,t('track.newGroup'));renderExpenseTable();persist();
    const hr=$('expBody').querySelector('tr.grouprow[data-gid="'+g.id+'"]');if(hr){const n=hr.querySelector('.gname');if(n){n.focus();if(n.select)n.select();}}});
  {const ca=$('collapseAll');if(ca)ca.addEventListener('click',toggleAllGroups);}
  // first-run welcome card
  {const ws=$('welcomeSample');if(ws)ws.addEventListener('click',loadSampleData);
   const wst=$('welcomeStart');if(wst)wst.addEventListener('click',()=>{dismissWelcome();const a=$('addExp');if(a)a.click();});
   const wx=$('welcomeDismiss');if(wx)wx.addEventListener('click',dismissWelcome);}
  {const tc=$('toastClose');if(tc)tc.addEventListener('click',hideToast);}
  // a11y: Settings had no Escape; add it, and Tab-trap focus inside whichever modal is open
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'){const so=$('setOvl');if(so&&!so.hidden)closeSettings();}
    if(ev.key==='Tab'){
      const open=[$('setOvl'),$('profOvl'),$('infoOvl')].find(o=>o&&!o.hidden);
      if(open){const panel=open.querySelector('.setpanel,.infopanel');trapTab(panel,ev);}
    }
  });

  // Track: income field + bridge button
  $('incomeN').addEventListener('input',()=>{const v=parseNum($('incomeN').value);
    data.income[currentYear]=isNaN(v)?0:v;refreshSummary();persist();});
  $('pushSave').addEventListener('click',()=>{
    const inc=parseNum($('incomeN').value)||0;
    const mIdx=new Date().getMonth();
    const monthCost=perMonthTotals(currentYear)[mIdx];   // use the precise current-month cost
    const free=Math.max(0,Math.round((inc-monthCost)/50)*50);
    const sl=$('contrib');const capped=Math.min(+sl.max,Math.max(+sl.min,free));
    sl.value=capped;markForecastTouched('saving');render();   // arriving via "Send to plan" counts as setting saving
    if(free>+sl.max)setStatus(t('status.savingCapped',{max:(+sl.max).toLocaleString('de-DE')}),'bad');
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
  // startup banner: reconnect / open data file
  const sdis=$('startupDismiss');if(sdis)sdis.addEventListener('click',()=>{const b=$('startupBar');if(b)b.hidden=true;});

  wireMonthsHover();
  wireLifeHover();
  wireInvestHover();
  wireSwipe();

  window.addEventListener('resize',()=>{
    // The mobile soft keyboard fires resize on input focus. reclampSplits re-parents
    // tiles and repaintCanvases->renderInvest->buildInvestLedger wipes the ledger DOM
    // (innerHTML=''), either of which blurs the focused field -> keyboard closes and the
    // page jumps to top. While a field is being edited, do nothing.
    const ae=document.activeElement;
    if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'))return;
    reclampSplits();repaintCanvases();
  });
}

/* ============================== INIT ============================== */
/* ---- toast + screen-reader live region (shared: undo, update-ready, announcements) ---- */
let _toastTimer=null;
function announce(msg){const lr=$('liveRegion');if(lr)lr.textContent=msg;}
function showToast(msg, actionLabel, onAction){
  const el=$('toast');if(!el){announce(msg);return;}
  const m=$('toastMsg');if(m)m.textContent=msg;
  const a=$('toastAction');
  if(a){if(actionLabel&&typeof onAction==='function'){a.hidden=false;a.textContent=actionLabel;
      a.onclick=()=>{hideToast();onAction();};}else{a.hidden=true;a.onclick=null;}}
  el.hidden=false;announce(msg);
  clearTimeout(_toastTimer);_toastTimer=setTimeout(hideToast, actionLabel?9000:4000);
}
function hideToast(){const el=$('toast');if(el)el.hidden=true;clearTimeout(_toastTimer);}

/* ---- data-loss safety: one-step snapshot before any destructive replace/clear ---- */
function snapshotBeforeReplace(){try{if(FDStore.snapshot)FDStore.snapshot(data);}catch(e){}}
function offerUndo(){showToast(t('status.imported'), t('common.undo'), restoreSnapshot);}
function restoreSnapshot(){if(!FDStore.readSnapshot)return;
  FDStore.readSnapshot().then(s=>{if(s&&s.data){fileHandle=null;applyLoadedData(s.data);saveLocal();
    afterLoadRefresh();setStatus(t('status.restored'),'ok');showToast(t('status.restored'));}});}
// shape check: does a parsed object look like a Kontor data file?
function looksLikeKontor(o){return !!o&&typeof o==='object'&&('version'in o||'expenses'in o||'income'in o||'securities'in o||'projection'in o||'groupsByYear'in o);}

/* ---- first-run welcome + sample data (W4 onboarding) ---- */
function sampleData(){const y=String(THIS_YEAR);return {version:SCHEMA,
  income:{[y]:3200},
  groupsByYear:{[y]:[{id:'gh',name:'Wohnen',collapsed:false},{id:'gs',name:'Abos',collapsed:false},{id:'gi',name:'Versicherungen',collapsed:false}]},
  expenses:{[y]:[
    {id:'s1',name:'Miete',amount:1100,unit:'month',groupId:'gh',months:Array(12).fill(true)},
    {id:'s2',name:'Strom',amount:75,unit:'month',groupId:'gh',months:Array(12).fill(true)},
    {id:'s3',name:'Internet',amount:40,unit:'month',groupId:'gs',months:Array(12).fill(true)},
    {id:'s4',name:'Streaming',amount:13,unit:'month',groupId:'gs',months:Array(12).fill(true)},
    {id:'s5',name:'Haftpflicht',amount:80,unit:'year',groupId:'gi',months:Array(12).fill(true)},
    {id:'s6',name:'KFZ-Versicherung',amount:600,unit:'year',groupId:'gi',months:Array(12).fill(true)}
  ]},
  securities:{startBalance:5000,startMonth:thisYM(),ledger:{},values:{},notes:{},benchmark:null}};}
function anyExpenses(){return Object.keys(data.expenses).some(y=>(data.expenses[y]||[]).length>0);}
function showWelcomeIfNew(){
  const card=$('welcomeCard');if(!card)return;
  let onboarded=false;try{onboarded=!!localStorage.getItem('kontor_onboarded');}catch(e){}
  card.hidden=(onboarded||anyExpenses());
}
function dismissWelcome(){const c=$('welcomeCard');if(c)c.hidden=true;
  try{localStorage.setItem('kontor_onboarded','1');}catch(e){}}
function loadSampleData(){applyLoadedData(sampleData());dismissWelcome();afterLoadRefresh();persist();setStatus(t('status.imported'),'ok');}

/* ========================== APP LOCK (v1.2) ========================= */
/* Boot gate. Resolves null when the lock is off; when it's on, resolves the
   decrypted data object after a successful unlock (the codec is installed so
   every later read/write goes through the envelope). The meta normally sits
   in localStorage; the IndexedDB mirror covers the iOS-evicted-LS case where
   the encrypted data survives but the early <head> check saw nothing. */
function lockBoot(){
  if(typeof FDLock==='undefined')return Promise.resolve(null);
  const meta=FDLock.isEnabled()?Promise.resolve(true)
    :FDStore.getAux('lockmeta').then(m=>{if(m){FDLock.writeMeta(m);return true;}return false;});
  return meta.then(on=>{
    if(!on){document.documentElement.classList.remove('locked');return null;}
    document.documentElement.classList.add('locked');
    FDStore.setCodec(FDLock.codec());
    return showUnlock().then(()=>{
      const raw=FDStore.readSync();
      return (raw?FDLock.decodeData(raw):FDStore.readDurable()).catch(()=>null);
    }).then(obj=>{document.documentElement.classList.remove('locked');return obj;});
  }).catch(()=>{document.documentElement.classList.remove('locked');return null;});
}
/* The unlock screen. Resolves once the DEK is unwrapped; never rejects —
   the only ways forward are a successful unlock or the wipe escape hatch. */
function showUnlock(){
  return new Promise(resolve=>{
    const bio=$('lockBioBtn'),form=$('lockPinForm'),pin=$('lockPin'),err=$('lockErr'),forgot=$('lockForgot');
    const fail=k=>{if(err){err.textContent=t(k);err.hidden=false;}};
    if(bio&&FDLock.hasBiometric()){bio.hidden=false;
      bio.addEventListener('click',()=>{FDLock.unlockWithBiometric().then(resolve,()=>fail('lock.bioFail'));});}
    if(form)form.addEventListener('submit',ev=>{ev.preventDefault();
      const v=(pin&&pin.value)||'';if(!v)return;
      form.classList.add('busy');            // PBKDF2 at 600k iterations takes a beat
      FDLock.unlockWithPin(v).then(resolve,()=>{form.classList.remove('busy');fail('lock.wrong');if(pin)pin.select();});});
    if(forgot)forgot.addEventListener('click',()=>{
      if(!confirm(t('lock.wipeConfirm1'))||!confirm(t('lock.wipeConfirm2')))return;
      FDStore.setCodec(null);FDLock.wipe();
      try{localStorage.removeItem('kontor_onboarded');}catch(e){}
      Promise.all([FDStore.clear(),FDStore.snapshot(null),FDStore.putAux('lockmeta',null),forgetHandle()])
        .then(()=>location.reload());});
    if(pin&&!FDLock.hasBiometric())pin.focus();
  });
}
/* The lock meta must survive localStorage eviction alongside the data. */
function mirrorLockMeta(){try{FDStore.putAux('lockmeta',FDLock.readMeta());}catch(e){}}
function syncLockUI(){
  if(typeof FDLock==='undefined'||!$('lockSetupOff'))return;
  const on=FDLock.isEnabled();
  $('lockSetupOff').hidden=on;$('lockSetupOn').hidden=!on;
  const st=$('lockStateLine');if(st)st.textContent=on?t(FDLock.hasBiometric()?'set.lock.on.bio':'set.lock.on.pin'):'';
  const bt=$('lockBioToggleBtn');if(bt)bt.textContent=t(FDLock.hasBiometric()?'set.lock.removeBio':'set.lock.addBio');
  const ph=$('privacyHint');if(ph){const k=on?'set.privacy.hintLocked':'set.privacy.hint';
    ph.setAttribute('data-i18n',k);ph.textContent=t(k);}
}
function wireLock(){
  if(typeof FDLock==='undefined'||!$('lockSetupOff'))return;
  const en=$('lockEnableBtn');if(en)en.addEventListener('click',()=>{
    $('lockEnableForm').hidden=false;en.hidden=true;
    FDLock.bioAvailable().then(av=>{$('lockBioOptRow').hidden=!av;});
    $('lockPin1').focus();});
  const enX=$('lockEnableCancel');if(enX)enX.addEventListener('click',()=>{
    $('lockEnableForm').hidden=true;$('lockEnableBtn').hidden=false;$('lockPin1').value='';$('lockPin2').value='';});
  // validation + failure feedback must be INLINE: setStatus targets the header
  // status span, which sits behind the settings modal and is never seen here
  const inlineErr=(id,key)=>{const el=$(id);if(el){el.textContent=key?t(key):'';el.hidden=!key;}};
  const go=$('lockEnableGo');if(go)go.addEventListener('click',()=>{
    inlineErr('lockEnableErr',null);
    const p1=$('lockPin1').value||'',p2=$('lockPin2').value||'';
    if(p1.length<6){inlineErr('lockEnableErr','set.lock.short');return;}
    if(p1!==p2){inlineErr('lockEnableErr','set.lock.mismatch');return;}
    const wantBio=!$('lockBioOptRow').hidden&&$('lockBioOpt').checked;
    const label=go.textContent;go.disabled=true;go.textContent=t('set.lock.busy');
    const done=()=>{go.disabled=false;go.textContent=label;};
    let p;try{p=FDLock.setup(p1,wantBio);}catch(e){done();inlineErr('lockEnableErr','status.lockFailed');return;}
    p.then(r=>{
      FDStore.setCodec(FDLock.codec());mirrorLockMeta();
      persist();FDStore.snapshot(data);      // re-store the data and the undo slot encrypted
      done();
      $('lockEnableForm').hidden=true;$('lockEnableBtn').hidden=false;
      $('lockPin1').value='';$('lockPin2').value='';
      syncLockUI();setStatus(t('status.lockOn'),'ok');
      if(wantBio&&!r.bioEnabled)showToast(t('set.lock.bioNoPrf'));
    },()=>{done();inlineErr('lockEnableErr','status.lockFailed');});});
  const now=$('lockNowBtn');if(now)now.addEventListener('click',()=>{FDLock.lock();location.reload();});
  const cp=$('lockChangePinBtn');if(cp)cp.addEventListener('click',()=>{$('lockPinChangeForm').hidden=false;$('lockNewPin1').focus();});
  const cpX=$('lockPinChangeCancel');if(cpX)cpX.addEventListener('click',()=>{
    $('lockPinChangeForm').hidden=true;$('lockNewPin1').value='';$('lockNewPin2').value='';});
  const cpGo=$('lockPinChangeGo');if(cpGo)cpGo.addEventListener('click',()=>{
    inlineErr('lockOnErr',null);
    const p1=$('lockNewPin1').value||'',p2=$('lockNewPin2').value||'';
    if(p1.length<6){inlineErr('lockOnErr','set.lock.short');return;}
    if(p1!==p2){inlineErr('lockOnErr','set.lock.mismatch');return;}
    const label=cpGo.textContent;cpGo.disabled=true;cpGo.textContent=t('set.lock.busy');
    const done=()=>{cpGo.disabled=false;cpGo.textContent=label;};
    FDLock.changePin(p1).then(()=>{mirrorLockMeta();done();
      $('lockPinChangeForm').hidden=true;$('lockNewPin1').value='';$('lockNewPin2').value='';
      setStatus(t('status.pinChanged'),'ok');showToast(t('status.pinChanged'));},
      ()=>{done();inlineErr('lockOnErr','status.lockFailed');});});
  const bt=$('lockBioToggleBtn');if(bt)bt.addEventListener('click',()=>{
    inlineErr('lockOnErr',null);
    (FDLock.hasBiometric()?FDLock.removeBiometric():FDLock.addBiometric())
      .then(()=>{mirrorLockMeta();syncLockUI();},()=>inlineErr('lockOnErr','set.lock.bioNoPrf'));});
  const dis=$('lockDisableBtn');if(dis)dis.addEventListener('click',()=>{
    if(!confirm(t('set.lock.disableConfirm')))return;
    FDLock.disable().then(()=>{FDStore.setCodec(null);FDStore.putAux('lockmeta',null);
      persist();FDStore.snapshot(data);syncLockUI();setStatus(t('status.lockOff'),'ok');});});
}

function init(){
  wire();
  loadSettings();              // appearance prefs (browser-local)
  if(typeof applyI18n==='function')applyI18n(document);   // localize static markup to the active language
  applyFont();applyDensity();applyThemeVisual();  // paint look before first render
  lockBoot().then(initMain);   // app lock gate: everything below waits for the key
}
function initMain(preloaded){
  if(preloaded)applyLoadedData(preloaded);
  else loadLocal();            // restore last session (also applies projection)
  ensureSecurities();reconcileSecurities();
  // fresh start: seed common fixed-cost categories (in the active language) into the current year
  const anyGroups=Object.keys(data.groupsByYear||{}).some(y=>(data.groupsByYear[y]||[]).length>0);
  const anyExp=Object.keys(data.expenses).some(y=>(data.expenses[y]||[]).length>0);
  const seeds=(typeof tList==='function'&&tList('seed.groups').length)?tList('seed.groups'):['Housing','Subscriptions','Insurance'];
  if(!anyGroups&&!anyExp)seeds.forEach(n=>addGroup(THIS_YEAR,n));
  currentYear=THIS_YEAR;
  buildYearStrip();
  wireLayout();                // tab drag-reorder + resizable splitter
  render();                    // prime Plan tab
  switchYear(currentYear);     // prime Track tab data
  showTab('track');            // Track is the default landing tab
  showWelcomeIfNew();          // first-run welcome card (until the user has data or dismisses)
  tryReconnectOnStartup();     // offer to relink the data file (or auto-relink if permitted)
  hydrateDurable();            // persist storage + restore from IndexedDB if localStorage was evicted
}
// Re-localize after a language switch: re-apply static markup + re-render dynamic views
// so JS-built strings (verdict, status, labels) pick up the new language. (Called by setLang.)
window.__kontorRelocalize=function(){
  try{if(tList('months').length===12)MONTHS=tList('months');}catch(e){}
  try{applyI18n(document);}catch(e){}
  try{buildYearStrip();}catch(e){}
  try{updateStartupBanner();}catch(e){}
  try{if(typeof syncSettingsUI==='function')syncSettingsUI();}catch(e){}
  try{if(typeof syncProfileUI==='function')syncProfileUI();}catch(e){}
  try{
    if($('tabPlan')&&$('tabPlan').style.display!=='none')render();
    else if($('tabInvest')&&$('tabInvest').style.display!=='none')renderInvest();
    else renderExpenseTable();
  }catch(e){}
};
document.addEventListener('DOMContentLoaded',init);
