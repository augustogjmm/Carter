/* Carter 4H Top 50 radar: same CarterEngine indicators as manual analysis. */
(function(){
'use strict';
const $=id=>document.getElementById(id),BAR=14400000;
let busy=false;
const status=$('carterRadarStatus'),rows=$('carterRadarRows'),refresh=$('carterRadarRefresh');
if(!status||!rows||!window.CarterEngine)return;
async function json(url,timeout=13000){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 try{const r=await fetch(url,{signal:ac.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
 finally{clearTimeout(timer);}
}
async function top50(){
 for(const url of ['/api/top50','https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false']){
 try{const x=await json(url);const a=Array.isArray(x)?x:x.items;if(Array.isArray(a)&&a.length===50)return a;}catch(e){}
 }
 throw Error('No se pudo obtener un ranking Top 50 verificable');
}
async function evaluate(coin){
 const symbol=String(coin.symbol||'').toUpperCase(),pair=symbol+'USDT';
 if(!/^[A-Z0-9]{2,15}$/.test(symbol)||symbol==='USDT')return {state:'sin par',pair};
 let raw=null,err;
 for(const host of ['https://data-api.binance.vision','https://api.binance.com']){
 try{raw=await json(host+'/api/v3/klines?symbol='+encodeURIComponent(pair)+'&interval=4h&limit=350',11000);if(Array.isArray(raw))break;}catch(e){err=e;}
 }
 if(!Array.isArray(raw)||raw.length<250)return{state:'sin datos',pair,reason:err?.message||'Sin histórico suficiente'};
 const now=Date.now(),bars=raw.filter(x=>Number(x[6])<now-1000).map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]}));
 const expected=Math.floor(now/BAR)*BAR-BAR,last=bars.at(-1);
 if(bars.length<250||last?.t!==expected)return{state:'desactualizado',pair};
 for(let i=Math.max(1,bars.length-250);i<bars.length;i++)if(bars[i].t-bars[i-1].t!==BAR)return{state:'huecos',pair};
 const min=Number($('adxMin')?.value||25),enabled=$('adxEnabled')?.checked!==false;
 const s=window.CarterEngine.indicators(bars,min,enabled),i=bars.length-1;
 return{state:s.signal[i]?'señal':'sin señal',pair,price:last.c,adx:s.adx[i],trend:s.trend[i],fire:s.fire[i],momentum:s.momentumOK[i],time:last.t};
}
function tile(coin,result){
 const div=document.createElement('div');div.style.cssText='padding:11px;border:1px solid #7775;border-radius:10px;background:'+(result.state==='señal'?'rgba(20,160,85,.19)':'transparent');
 const title=document.createElement('strong');title.textContent=(coin.market_cap_rank||coin.rank||'')+' · '+String(coin.symbol).toUpperCase()+' · '+result.state.toUpperCase();
 const info=document.createElement('div');info.style.cssText='font-size:12px;opacity:.8;margin:6px 0';info.textContent=coin.name+' · '+result.pair+(Number.isFinite(result.adx)?' · ADX '+result.adx.toFixed(1):'');
 div.append(title,info);
 if(result.state==='señal'||result.state==='sin señal'){
 const b=document.createElement('button');b.type='button';b.textContent='Abrir análisis 4H';b.className='btn';b.addEventListener('click',()=>{ $('symbol').value=result.pair;$('analyze').click();window.scrollTo({top:0,behavior:'smooth'});});div.append(b);
 }
 return div;
}
async function scan(){
 if(busy)return;busy=true;refresh.disabled=true;rows.replaceChildren();status.textContent='Consultando ranking…';
 try{
 const coins=await top50();let done=0,green=0,idx=0;const results=Array(coins.length);
 async function worker(){while(idx<coins.length){const i=idx++;let result;try{result=await evaluate(coins[i]);}catch(e){result={state:'error',pair:String(coins[i].symbol).toUpperCase()+'USDT',reason:e.message};}results[i]=result;done++;if(result.state==='señal')green++;status.textContent=done+'/50 analizadas · '+green+' señales Carter confirmadas';rows.replaceChildren(...coins.slice(0,done===50?50:coins.length).map((c,k)=>results[k]?tile(c,results[k]):(()=>{const d=document.createElement('div');d.textContent=c.symbol+' · pendiente';return d;})()));}}
 await Promise.all(Array.from({length:4},worker));
 status.textContent='50/50 evaluadas · '+green+' señales confirmadas · '+new Date().toLocaleString('es-AR');
 }catch(e){status.textContent='Radar no disponible: '+e.message;}
 finally{busy=false;refresh.disabled=false;}
}
refresh.addEventListener('click',scan);
scan();
setInterval(()=>{if(!document.hidden&&!busy)scan();},BAR);
})();