/* PCS Radar Top 50 — scans market-cap top 50 while this page is open.
   A green tile is a CONFIRMED CLOSED-CANDLE signal, not a market order.
   Independently applies the unchanged PCSEngine indicators and signal rules. */
(function(){
'use strict';
const $=id=>document.getElementById(id), BAR=14400000, ONE_HOUR=3600000;
const SOURCES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
const STABLE=new Set(['tether','usd-coin','dai','ethena-usde','usds','usdd','first-digital-usd','paypal-usd','true-usd','frax','frax-usd','usdd','usual-usd','world-liberty-financial-usd','binance-usd','pax-dollar','gemini-dollar','usdt0','rlusd','ripple-usd','usdf','a7a5','usde','usd1','ondo-us-dollar-yield','yield-bearing-usd']);
const WRAPPED=new Set(['wrapped-bitcoin','wrapped-steth','staked-ether','wrapped-eth','coinbase-wrapped-btc','bitcoin-avalanche-bridged-btc-b','lido-staked-ether','rocket-pool-eth','binance-bridged-usdt-bnb-smart-chain','wrapped-eeth','renbtc','wrapped-solana','wrapped-bnb','bridged-usdc-polygon-pos-bridge','wrapped-tron','binance-peg-ethereum','binance-peg-dogecoin','paypal-wrapped-bitcoin']);
const R={coins:[],marketAt:0,source:'',items:[],pool:[],busy:false,scanned:0,verified:0,scanAt:0,token:0,view:'all',sortSignals:true,barId:null,attemptAt:0,problem:''};
const fmt=(v,n=2)=>Number.isFinite(v)?Number(v).toLocaleString('en-US',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
const time=t=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
const label=(id,t)=>{$(id).textContent=String(t);};
const finite=Number.isFinite;
function reasonFor(signal,adx,volumeRatio){
if(signal.A&&signal.B)return 'Ruptura post-squeeze + rebote EMA10';
if(signal.A)return 'Ruptura post-squeeze, ADX '+fmt(adx,1)+' · Vol '+fmt(volumeRatio,2)+'×';
if(signal.B)return 'Rebote EMA10, vela alcista, ADX '+fmt(adx,1);
if(signal.regime)return 'Régimen alcista, faltan condiciones A/B';
return 'Fuera del régimen: no habilitar long';
}
function classify(bars){
if(!Array.isArray(bars)||bars.length<250)throw new Error('Menos de 250 velas cerradas');
const sorted=window.PCSEngine.dedup(bars),expected=Math.floor(Date.now()/BAR)*BAR-BAR;
if(sorted.length<250)throw new Error('Insuficiente histórico deduplicado');
const last=sorted.at(-1),prev=sorted.at(-2);
if(last.t!==expected||last.t-prev.t!==BAR)throw new Error('Última vela 4H no sincronizada');
for(let k=Math.max(1,sorted.length-350);k<sorted.length;k++)if(sorted[k].t-sorted[k-1].t!==BAR)throw new Error('Hueco en velas recientes');
const ind=window.PCSEngine.indicators(sorted),i=sorted.length-1,q=ind.sig[i];
const simulated=window.PCSEngine.backtest(sorted,ind,1000,3),positionOpen=!!simulated.pos;
if(!finite(ind.ema200[i])||!finite(ind.adx[i])||!finite(ind.atr[i])||ind.atr[i]<=0)throw new Error('Indicadores no confirmados');
let volRatio=ind.v20[i]>0?last.v/ind.v20[i]:NaN;
return{signal:!!(q.A||q.B)&&!positionOpen,positionOpen,regime:!!q.regime,A:!!q.A,B:!!q.B,sq:!!q.squeeze,adx:ind.adx[i],diPlus:ind.plus[i],diMinus:ind.minus[i],atr:ind.atr[i],price:last.c,volumeRatio:volRatio,lastCandle:last.t,reason:positionOpen?'PCS ya mantiene una posición teórica abierta: no admite nueva entrada':reasonFor(q,ind.adx[i],volRatio)};
}
function normalizeCoins(rows){
if(!Array.isArray(rows)||rows.length!==50)throw new Error('El ranking no tiene exactamente 50 activos');
const list=rows.map(x=>({id:String(x.id),symbol:String(x.symbol).toUpperCase(),name:String(x.name),rank:Number(x.market_cap_rank??x.rank),price:Number(x.current_price??x.price),change:Number(x.price_change_percentage_24h??x.change24h),marketCap:Number(x.market_cap??x.marketCap)}));
if(list.some(x=>!x.id||!x.symbol||!x.name||!Number.isInteger(x.rank)||x.rank<1))throw new Error('Ranking inválido');
if(new Set(list.map(x=>x.rank)).size!==50)throw new Error('Ranking de capitalización ambiguo');
if(new Set(list.map(x=>x.id)).size!==50)throw new Error('Ranking duplicado');
return list;
}
function getJson(url,timeout=13000){
return new Promise((resolve,reject)=>{
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 fetch(url,{cache:'no-store',signal:ac.signal,headers:{accept:'application/json'}}).then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);const x=await r.json();resolve(x);}).catch(reject).finally(()=>clearTimeout(timer));
});
}
async function rank(){
let errors=[],raw;
for(let u of ['/api/top50','https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false']){
 try{
  let r=await getJson(u,16000),list=Array.isArray(r)?r:r.items;
  const coins=normalizeCoins(list);return{coins,source:Array.isArray(r)?'CoinGecko API pública':'CoinGecko · proxy Vercel',at:Date.parse(r.fetchedAt)||Date.now()};
 }catch(e){errors.push(e.message);}
}
throw new Error('No se pudo verificar el top 50 CoinGecko ('+errors.join('; ')+'). No se presenta un ranking inventado.');
}
async function exchange(){
let errors=[];
for(let url of SOURCES){
 try{
  const data=await window.PCSEngine.getJson(url+'/api/v3/exchangeInfo');
  if(!Array.isArray(data?.symbols))throw new Error('exchangeInfo inválido');
  const set=new Set();
  for(const x of data.symbols){
   if(x.status!=='TRADING'||x.quoteAsset!=='USDT'||x.isSpotTradingAllowed===false)continue;
   if(x.permissionSets&&x.permissionSets.length&&!x.permissionSets.some(g=>Array.isArray(g)&&g.includes('SPOT')))continue;
   if(x.permissions?.length&&!x.permissions.includes('SPOT')&&!x.permissionSets)continue;
   set.add(x.baseAsset.toUpperCase());
  }
  if(set.size<50)throw new Error('Catálogo inesperadamente pequeño');
  return set;
 }catch(e){errors.push(e.message);}
}
throw new Error('No se pudo validar qué activos operan spot USDT en Binance: '+errors.join(' / '));
}
function unscannable(c,available,duplicated){
if(STABLE.has(c.id)||/^(USDT|USDC|DAI|USDE|FDUSD|PYUSD|USDS|USD1|TUSD|USDD|RLUSD|USDG|USD0|USDF)$/i.test(c.symbol))return{status:'excluded',reason:'Stablecoin / paridad estable: PCS tendencial no aplicable'};
if(WRAPPED.has(c.id)||/^(wrapped|bridged|staked)/i.test(c.name))return{status:'excluded',reason:'Token envuelto/staking: no se sustituye por el subyacente'};
if(duplicated.has(c.symbol))return{status:'excluded',reason:'Símbolo ambiguo dentro del top 50: no se asume equivalencia'};
if(!available.has(c.symbol))return{status:'missing',reason:'No existe par '+c.symbol+'USDT spot TRADING verificado en Binance'};
return null;
}
async function candles(symbol){return (await window.PCSEngine.download(symbol+'USDT')).bars;}
function make(tag,className,content){
let el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=String(content);return el;
}
function fmtPrice(v){
if(!Number.isFinite(v))return '—';
return v>=100?fmt(v,2):v>=1?fmt(v,3):v>=.01?fmt(v,5):fmt(v,8);
}
function statusClass(item){return item.status==='signal'?'radar-long':(item.status==='watch'||item.status==='position')?'radar-watch':item.status==='error'?'radar-error':item.status==='scanning'?'radar-active':'radar-idle';}
function statusText(item){
return({signal:item.A&&item.B?'LONG A+B':item.A?'LONG A':item.B?'LONG B':'LONG',watch:'VIGILAR',position:'LONG PREVIO',blocked:'SIN ENTRADA',missing:'SIN PAR',excluded:'NO APLICA',error:'SIN DATOS',scanning:'ANALIZANDO',queued:'EN COLA'})[item.status]||item.status.toUpperCase();
}
function render(){
const total=R.items.length,signals=R.items.filter(x=>x.status==='signal'),watched=R.items.filter(x=>x.status==='watch'),done=R.items.filter(x=>!['queued','scanning'].includes(x.status)),failed=R.items.filter(x=>x.status==='error');
label('radarPositive',signals.length);label('radarWatch',watched.length);label('radarProgress',done.length+' / '+(total||50));
label('radarStatus',R.problem?'Radar no disponible: '+R.problem:R.busy?'Analizando '+done.length+' de '+total+' · '+(signals.length?'hay señales PCS':'sin señales confirmadas hasta ahora'):(failed.length?'Escaneo parcial':'Escaneo finalizado')+' · '+done.length+' / '+(total||50));
label('radarSource',R.source?(R.source+' · ranking '+time(R.marketAt)+' · 4H Binance'):'Ranking en espera');
const bar=$('radarBar');bar.style.width=(total?done.length/total*100:0)+'%';
let a=[...R.items];if(R.sortSignals){let priorities={signal:0,watch:1,position:1,blocked:2,scanning:3,queued:3,missing:4,excluded:4,error:5};a.sort((x,y)=>(priorities[x.status]??6)-(priorities[y.status]??6)||x.rank-y.rank);}else a.sort((x,y)=>x.rank-y.rank);
if(R.view==='signal')a=a.filter(x=>x.status==='signal');
let body=$('radarRows');body.replaceChildren();
for(let item of a){
 const tr=make('tr','radar-tr '+statusClass(item));
 if(item.status==='signal')tr.setAttribute('data-signal','long');
 const rank=make('td','radar-rank','#'+item.rank);
 const identity=make('td','radar-identity');
 identity.append(make('b','',item.symbol),make('small','',item.name));
 const market=make('td','radar-price',fmtPrice(item.price));
 let d=make('td','radar-change',Number.isFinite(item.change)?(item.change>=0?'+':'')+fmt(item.change,1)+'%':'—');
 if(Number.isFinite(item.change))d.classList.add(item.change>=0?'radar-up':'radar-down');
 const tag=make('td','radar-signal');
 tag.append(make('strong','radar-pill',statusText(item)));
 const detail=make('td','radar-detail',item.reason||'Esperando análisis 4H');
 const values=make('td','radar-technical',Number.isFinite(item.adx)?'ADX '+fmt(item.adx,1)+' · V '+fmt(item.volumeRatio,2)+'×':'—');
 let action=make('td','radar-action');
 if(item.symbol&&['signal','watch','blocked','position'].includes(item.status)&&item.available){
  let btn=make('button','radar-open','Ver gráfico ↗');btn.type='button';btn.title='Abrir '+item.symbol+'USDT en el gráfico PCS';btn.addEventListener('click',()=>openChart(item));action.append(btn);
 }else action.append(make('span','radar-muted','—'));
 tr.append(rank,identity,market,d,tag,detail,values,action);body.append(tr);
}
if(!a.length){let row=make('tr'),td=make('td','radar-empty',R.items.length?'No hay señales PCS confirmadas entre los activos analizados.':'Cargando el top 50…');td.colSpan=8;row.append(td);body.append(row);}
label('radarScanAt',R.scanAt?'Última revisión '+time(R.scanAt)+' ARG · '+signals.length+' señales · '+failed.length+' con errores':'Esperando resultados');
label('radarAlert',signals.length?'VERDES: señales confirmadas al cierre 4H. La siguiente apertura puede haber ocurrido; revisá el gráfico, el precio y el riesgo antes de decidir.':'Verde solo cuando A o B cumple íntegramente el régimen PCS en la última 4H cerrada. No se anticipan velas.');
}
function openChart(item){
if(!window.PCSApp?.loadSymbol){label('radarStatus','No se pudo abrir el gráfico: inicialización pendiente');return;}
const symbol=item.symbol+'USDT';window.PCSApp.loadSymbol(symbol);
label('radarSelected','Detalle seleccionado: '+symbol+' · '+item.reason);
const chart=document.querySelector('.pcs-chartpanel');chart?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function workItem(item,token){
if(token!==R.token)return;
item.status='scanning';item.reason='Consultando histórico PCS 4H…';render();
try{
const bars=await candles(item.symbol);
if(token!==R.token)return;
const value=classify(bars);
Object.assign(item,value,{status:value.positionOpen?'position':value.signal?'signal':value.regime?'watch':'blocked',available:true,reason:value.reason});
}catch(e){if(token!==R.token)return;item.status='error';item.available=false;item.reason=e.message||String(e);}
render();
}
async function scan(forceRank=false){
if(R.busy)return;
R.busy=true;R.token++;const token=R.token;R.scanAt=0;R.attemptAt=Date.now();R.problem='';
for(const item of R.items){item.status='queued';item.reason='Revalidando la última vela 4H: señal anterior suspendida';}
render();
$('radarRefresh').disabled=true;label('radarStatus','Verificando ranking por capitalización…');
try{
if(!forceRank){
 try{
 const remote=await getJson('/data/radar.json',6000),expected=Math.floor(Date.now()/BAR)*BAR-BAR;
 if(remote.version!==2||remote.lastCandle!==expected||!Array.isArray(remote.items)||remote.items.length!==50||Date.now()-Date.parse(remote.generatedAt)>BAR)throw new Error('Snapshot remoto no vigente');
 normalizeCoins(remote.items);
 R.items=remote.items;R.coins=remote.items;R.marketAt=Date.parse(remote.marketAt);R.source='Escaneo programado · CoinGecko / Binance';R.scanAt=Date.parse(remote.generatedAt);R.barId=Math.floor(Date.now()/BAR);R.problem='';
 label('radarError','');$('radarError').classList.remove('show');return;
 }catch(e){/* El escaneo local mantiene servicio si el programado está pendiente. */}
}
let ranked;
if(forceRank||!R.coins.length||Date.now()-R.marketAt>ONE_HOUR){
 ranked=await rank();R.coins=ranked.coins;R.marketAt=ranked.at;R.source=ranked.source;
}
const allowed=await exchange();
if(token!==R.token)return;
let eligible=R.coins.filter(x=>!STABLE.has(x.id)&&!WRAPPED.has(x.id)&&!(/^(wrapped|bridged|staked)/i.test(x.name)));
let counts={};for(let c of eligible)counts[c.symbol]=(counts[c.symbol]||0)+1;
let duplicates=new Set(Object.keys(counts).filter(x=>counts[x]>1));
R.items=R.coins.map(c=>{
 const gate=unscannable(c,allowed,duplicates);
 return {...c,status:gate?.status||'queued',reason:gate?.reason||'Pendiente de evaluar PCS 4H',available:allowed.has(c.symbol),A:false,B:false};
});
render();
const jobs=R.items.filter(x=>x.status==='queued');let next=0;
const runner=async()=>{while(next<jobs.length&&token===R.token){const j=next++;await workItem(jobs[j],token);}};
await Promise.all(Array.from({length:Math.min(4,jobs.length)},runner));
if(token!==R.token)return;
label('radarError','');$('radarError').classList.remove('show');
R.scanAt=Date.now();R.barId=Math.floor((Date.now()-3000)/BAR);
render();
}catch(e){
if(token===R.token){R.problem=String(e.message||e);label('radarError',R.problem);$('radarError').classList.add('show');for(const item of R.items){item.status='error';item.available=false;item.reason='El radar no está actualizado; no se conserva una señal verde antigua.';}if(!R.items.length){label('radarProgress','0 / 50');}}
}finally{if(token===R.token){R.busy=false;$('radarRefresh').disabled=false;render();}}
}
function autoCheck(){
if(R.busy)return;
const latestId=Math.floor((Date.now()-30000)/BAR);
if(R.barId===null){if(Date.now()-R.attemptAt>300000)scan(false);}else if(latestId>R.barId)scan(false);
}
function init(){
$('radarRefresh').addEventListener('click',()=>{label('radarError','');$('radarError').classList.remove('show');scan(true);});
$('radarOnly').addEventListener('change',e=>{R.view=e.target.checked?'signal':'all';render();});
$('radarSort').addEventListener('change',e=>{R.sortSignals=e.target.checked;render();});
render();scan(false);
setInterval(autoCheck,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoCheck();});
}
window.PCSScannerCore={classify,normalizeCoins,unscannable,rank,exchange,reasonFor};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();}
})();
