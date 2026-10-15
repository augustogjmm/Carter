/* Carter 4H analytical engine. No trades/orders or predictive claims. */
(function(){
'use strict';
const finite=Number.isFinite;
function ema(a,p){let out=Array(a.length).fill(null),v=null,k=2/(p+1);for(let i=0;i<a.length;i++){if(!finite(a[i]))continue;v=v===null?a[i]:v+k*(a[i]-v);if(i>=p-1)out[i]=v;}return out;}
function sma(a,p){let out=Array(a.length).fill(null),sum=0;for(let i=0;i<a.length;i++){sum+=a[i];if(i>=p)sum-=a[i-p];if(i>=p-1)out[i]=sum/p;}return out;}
function atr(c,p=14){let out=Array(c.length).fill(null),tr=c.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)):x.h-x.l);if(c.length<p)return out;let v=tr.slice(0,p).reduce((a,b)=>a+b,0)/p;out[p-1]=v;for(let i=p;i<c.length;i++){v=(v*(p-1)+tr[i])/p;out[i]=v;}return out;}
function adx(c,p=14){let len=c.length,pos=Array(len).fill(null),neg=Array(len).fill(null),adx=Array(len).fill(null),dx=Array(len).fill(null);if(len<2*p)return{adx,plusDI:pos,minusDI:neg};let tr=0,up=0,down=0;
function vals(i){let b=c[i],a=c[i-1],u=b.h-a.h,d=a.l-b.l;return [Math.max(b.h-b.l,Math.abs(b.h-a.c),Math.abs(b.l-a.c)),u>d&&u>0?u:0,d>u&&d>0?d:0];}
for(let i=1;i<=p;i++){let z=vals(i);tr+=z[0];up+=z[1];down+=z[2];}
for(let i=p;i<len;i++){if(i>p){let z=vals(i);tr=tr-tr/p+z[0];up=up-up/p+z[1];down=down-down/p+z[2];}pos[i]=tr?100*up/tr:0;neg[i]=tr?100*down/tr:0;dx[i]=pos[i]+neg[i]?100*Math.abs(pos[i]-neg[i])/(pos[i]+neg[i]):0;}
let first=0;for(let i=p;i<2*p;i++)first+=dx[i];adx[2*p-1]=first/p;for(let i=2*p;i<len;i++)adx[i]=((p-1)*adx[i-1]+dx[i])/p;return{adx,plusDI:pos,minusDI:neg};}
function linreg(a,p){let out=Array(a.length).fill(null),mid=(p-1)/2,den=p*(p*p-1)/12;for(let i=p-1;i<a.length;i++){let y=0,xy=0,valid=true;for(let j=0;j<p;j++){let v=a[i-p+1+j];if(!finite(v)){valid=false;break;}y+=v;xy+=(j-mid)*v;}if(valid)out[i]=y/p+xy/den*(p-1-mid);}return out;}
function indicators(c,minADX=25,useADX=true){
let len=c.length,close=c.map(x=>x.c),ema10=ema(close,10),ema55=ema(close,55),ema200=ema(close,200),ma=sma(close,20),at=atr(c,14),at20=atr(c,20),dmi=adx(c),bbU=Array(len).fill(null),bbL=Array(len).fill(null),kcU=Array(len).fill(null),kcL=Array(len).fill(null),sq=Array(len).fill(null),raw=Array(len).fill(null);
for(let i=19;i<len;i++){let h=-Infinity,l=Infinity,v=0;for(let j=i-19;j<=i;j++){h=Math.max(h,c[j].h);l=Math.min(l,c[j].l);v+=(close[j]-ma[i])**2;}let std=Math.sqrt(v/20);bbU[i]=ma[i]+2*std;bbL[i]=ma[i]-2*std;kcU[i]=ma[i]+1.5*at20[i];kcL[i]=ma[i]-1.5*at20[i];sq[i]=bbU[i]<kcU[i]&&bbL[i]>kcL[i];raw[i]=close[i]-(((h+l)/2+ma[i])/2);}
let mom=linreg(raw,20),fire=Array(len).fill(false),trend=Array(len).fill(false),momentumOK=Array(len).fill(false),adxOK=Array(len).fill(false),signal=Array(len).fill(false);
for(let i=1;i<len;i++){fire[i]=sq[i-1]===true&&sq[i]===false;trend[i]=finite(ema200[i])&&ema10[i]>ema55[i]&&ema55[i]>ema200[i]&&close[i]>ema10[i];momentumOK[i]=finite(mom[i])&&finite(mom[i-1])&&mom[i]>0&&mom[i]>mom[i-1];adxOK[i]=finite(dmi.adx[i])&&dmi.adx[i]>=minADX&&dmi.plusDI[i]>dmi.minusDI[i];signal[i]=fire[i]&&trend[i]&&momentumOK[i]&&finite(at[i])&&(!useADX||adxOK[i]);}
return{ema10,ema55,ema200,ma,at,at20,adx:dmi.adx,plusDI:dmi.plusDI,minusDI:dmi.minusDI,bbU,bbL,kcU,kcL,sq,mom,fire,trend,momentumOK,adxOK,signal};
}
/* OHLCV does not contain executions at each price. Uniform intrabar distribution is approximate. */
function volumeProfile(rows,bins=72){
let c=rows.filter(x=>finite(x.l)&&finite(x.h)&&finite(x.v)&&x.v>0);if(!c.length)return null;let low=Math.min(...c.map(x=>x.l)),high=Math.max(...c.map(x=>x.h));if(high<=low)return null;
let step=(high-low)/bins,vol=Array(bins).fill(0);
for(let b of c){let a=Math.max(0,Math.min(bins-1,Math.floor((b.l-low)/step))),z=Math.max(0,Math.min(bins-1,Math.floor((b.h-low)/step)));if(b.h-b.l<step*0.000001){vol[a]+=b.v;continue;}for(let k=a;k<=z;k++){let overlap=Math.max(0,Math.min(b.h,low+step*(k+1))-Math.max(b.l,low+step*k));vol[k]+=b.v*overlap/(b.h-b.l);}}
let total=vol.reduce((a,b)=>a+b,0),pocIndex=vol.indexOf(Math.max(...vol)),a=pocIndex,z=pocIndex,captured=vol[pocIndex];
while(captured<total*.7&&(a>0||z<bins-1)){let lv=a>0?vol[a-1]:-1,rv=z<bins-1?vol[z+1]:-1;if(rv>lv){z++;captured+=vol[z];}else{a--;captured+=vol[a];}}
let hvns=[];for(let i=1;i<bins-1;i++){if(vol[i]>=vol[i-1]&&vol[i]>vol[i+1]&&vol[i]>=vol[pocIndex]*.24)hvns.push({price:low+(i+.5)*step,volume:vol[i]});}hvns.sort((x,y)=>y.volume-x.volume);
let uniq=[];for(let h of hvns){if(uniq.every(x=>Math.abs(x.price-h.price)>3*step))uniq.push(h);if(uniq.length>=10)break;}
return{low,high,step,vol,total,poc:low+(pocIndex+.5)*step,vah:low+(z+1)*step,val:low+a*step,hvns:uniq,first:c[0].t,last:c[c.length-1].t,candles:c.length};
}
function pivotLevels(c,period=160){let lows=[],highs=[],from=Math.max(2,c.length-period);for(let i=from;i<c.length-2;i++){let lo=c[i].l,hi=c[i].h;if(lo<c[i-1].l&&lo<=c[i-2].l&&lo<c[i+1].l&&lo<=c[i+2].l)lows.push({price:lo,source:'Mínimo 4H confirmado'});if(hi>c[i-1].h&&hi>=c[i-2].h&&hi>c[i+1].h&&hi>=c[i+2].h)highs.push({price:hi,source:'Máximo 4H confirmado'});}return{lows,highs};}
function tradePlan(c,s,vp,quote,fresh,capital=1000,riskPct=1){
if(!c.length||!vp)return null;let i=c.length-1,at=s.at[i],b=c[i],price=finite(quote)?quote:b.c;
if(!finite(at)||at<=0||!finite(s.ema200[i]))return null;
let piv=pivotLevels(c),supports=[{price:vp.val,source:'VAL · volumen'},{price:vp.poc,source:'POC · volumen'},{price:s.ema55[i],source:'EMA55 · soporte dinámico'},{price:s.bbL[i],source:'Bollinger inferior'},...vp.hvns.map(x=>({price:x.price,source:'HVN · volumen'})),...piv.lows,...[{price:Math.min(...c.slice(-20).map(x=>x.l)),source:'Mínimo 20 velas'}]];
supports=supports.filter(x=>finite(x.price)&&x.price>0&&x.price<price-.12*at&&x.price>price-9*at).sort((a,b)=>b.price-a.price);
let unique=[];for(let x of supports){if(unique.every(y=>Math.abs(x.price-y.price)>.42*at))unique.push(x);}
let entries=[];
if(fresh&&s.signal[i])entries.push({price,source:'Disparo Carter · precio observado',trigger:'Señal 4H confirmada',live:true});
else{let found=unique.find(x=>x.price>=price-3*at);if(found)entries.push({...found,trigger:'Esperar recuperación y confirmación 4H',live:false});}
if(!entries.length)return {entries:[],reason:'No se encontró soporte cercano para planificar E1 sin perseguir precio.',vp,ready:false};
for(let x of unique){if(entries.length>=3)break;if(x.price<entries[entries.length-1].price-.55*at&&x.price>entries[0].price-7*at)entries.push({...x,trigger:'Solo con reconfirmación 4H y tendencia vigente',live:false});}
let weights=[.4,.35,.25].slice(0,entries.length),weightSum=weights.reduce((a,b)=>a+b,0),avg=entries.reduce((a,x,j)=>a+x.price*weights[j],0)/weightSum,first=entries[0].price,last=entries[entries.length-1].price;
let nearbyLows=piv.lows.filter(x=>x.price<last&&x.price>last-1.7*at).sort((x,y)=>y.price-x.price);let stop=Math.min(last,nearbyLows[0]?.price??last)-.45*at;
if(stop<=0)return{entries,reason:'No hay stop de invalidación positivo y coherente.',ready:false,vp};
let resistance=[{price:vp.vah,source:'VAH · borde superior de valor'},{price:vp.poc,source:'POC · nodo de volumen'},...vp.hvns.map(x=>({price:x.price,source:'HVN · nodo de volumen'})),...piv.highs,{price:s.bbU[i],source:'Bollinger superior'},{price:Math.max(...c.slice(-20).map(x=>x.h)),source:'Máximo 20 velas'},{price:Math.max(...c.slice(-60).map(x=>x.h)),source:'Máximo 60 velas'},{price:Math.max(...c.slice(-160).map(x=>x.h)),source:'Máximo 160 velas'}].filter(x=>finite(x.price)&&x.price>price+.15*at).sort((a,b)=>a.price-b.price);
let minTP=Math.max(price+.15*at,first+1.5*(first-stop),avg+1.5*(avg-stop));
let nearest=resistance[0]||null,target=resistance.find(x=>x.price>=minTP)||null;
let rrFirst=target?(target.price-first)/(first-stop):null,rrAvg=target?(target.price-avg)/(avg-stop):null;
let riskBudget=Math.max(0,capital)*Math.max(0,Math.min(5,riskPct))/100;
let unitRisk=avg-stop+avg*.002,units=unitRisk>0?Math.min(riskBudget/unitRisk,Math.max(0,capital)/avg):0;
let exposure=units*avg,reason=!target?'Sin resistencia superior con R/R ≥ 1,5 desde E1; no habilitar entrada.':entries.length<3?'Solo '+entries.length+' soporte(s) independiente(s) disponible(s). No completar artificialmente las tres compras.':'Tres zonas escalonadas apoyadas en niveles observables.';
let ready=!!entries[0].live&&!!target&&!!s.trend[i]&&units>0;
return{entries,avg,stop,target,nearest,rrFirst,rrAvg,riskBudget,units,exposure,ready,reason,vp,atr:at,quote:price,signal:s.signal[i],trend:s.trend[i]};
}
window.CarterEngine={indicators,volumeProfile,tradePlan,pivotLevels,atr,adx};
})();