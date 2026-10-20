const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
const E=require('../tl-engine.js'),C=require('../desk-chart.js');
const H4=14400000,now=Date.UTC(2026,9,20,17),end=Math.floor(now/H4)*H4;
const bars=Array.from({length:260},(_,i)=>{
 const p=100+Math.sin(i/12)*5+i*.065;
 return{t:end-(260-i)*H4,o:p,h:p+2+(i%3)*.1,l:p-2,c:p+(i%2===0?1:-1),v:200+i%17*12};
});
const ind={long:Array(260).fill(false),valid:Array(260).fill(true),parts:Array(260).fill({valid:true,trend:true,turn:false,weakness:false}),
ema10:Array(260).fill(112),ema55:Array(260).fill(108),ema200:Array(260).fill(102),
adx:Array(260).fill(24),momentum:Array(260).fill(.8),squeeze:Array(260).fill('OFF')};
ind.long[245]=true;
const calc=(arg={})=>C.build({bars,ind,engine:E,now,lookback:96,decision:{status:'ESPERAR',reason:'No signal'},
 scenario:{status:'NO_LONG',canBuyNow:false},...arg});
test('volume-by-price histogram is calculated from exactly the visible 4H range',()=>{
 const m=calc();a.equal(m.visible.length,96);a.equal(m.profile.bins.length,72);
 a(m.profile.poc>=m.profile.lo&&m.profile.poc<=m.profile.hi);
 a(m.profile.val<=m.profile.poc&&m.profile.vah>=m.profile.poc);
 a(Math.abs(m.profile.bins.reduce((s,v)=>s+v,0)-m.visible.reduce((s,b)=>s+b.v,0))<1e-6);
 a.match(m.profile.quality,/ESTIMADO/);a.equal(m.signalMarkers.length,1);
 for(const zoom of [48,96,168]){const mm=calc({lookback:zoom});a.equal(mm.visible.length,zoom);a.equal(mm.profile.bins.length,72);}
});
test('never renders entry/stop/target of a blocked setup or previous instrument',()=>{
 const no=calc();a.deepEqual(no.levels,[]);
 const candidate=calc({scenario:{status:'ESCENARIO_CONDICIONAL',trigger:119,stop:108,target:131,canBuyNow:false}});
 a.equal(candidate.levels.length,3);a(candidate.levels.every(x=>!x.active));
 const later=calc({scenario:{status:'NO_LONG',canBuyNow:false}});
 a.equal(later.levels.length,0);a(later.levels.every(x=>x.value!==119));
});
test('only confirmed current 4H ticket is shown as an actionable EXPERIMENTAL overlay',()=>{
 const t={entry:119,stop:108,target:131,quantity:1};
 const yes=calc({decision:{status:'CANDIDATO',ticket:t},scenario:{status:'ESCENARIO_CONDICIONAL',trigger:999,stop:987,target:1300,canBuyNow:false}});
 a.equal(yes.levels.length,3);a(yes.levels.every(x=>x.active));a.equal(yes.levels[0].value,119);
 a(!yes.levels.some(x=>x.value===999));
 const bad=calc({decision:{status:'NO_OPERABLE',ticket:t},scenario:{status:'NO_LONG',canBuyNow:false}});
 a.equal(bad.levels.length,0);
});
test('manually registered position dominates scenario without suggesting a new buy',()=>{
 const m=calc({position:{quantity:1.25,avgPrice:103,stop:97,target:115},
 scenario:{status:'ESCENARIO_CONDICIONAL',trigger:119,stop:108,target:131,canBuyNow:false}});
 a.equal(m.levels[0].label,'COSTO MEDIO · REGISTRADO');
 a(m.levels.every(x=>x.holding===true));a.equal(m.setup.outcome.includes('TENENCIA REGISTRADA'),true);
});
test('price profile and technical overlay reject missing or incomplete candles',()=>{
 a.throws(()=>calc({lookback:95}),/Escala temporal/);
 const broken=bars.map(x=>({...x}));broken[220].t+=H4;
 a.throws(()=>calc({bars:broken}),/Huecos/);
 const stale=bars.slice(0,-1);
 a.throws(()=>calc({bars:stale}),/cierre 4H desactualizado/);
});
test('canvas draws candles, real estimated horizontal bars, momentum and ADX without browser dependencies',()=>{
 let rectangles=0,strokes=0;
 const ctx=new Proxy({},{get(target,key){if(key==='fillRect')return(...args)=>{rectangles++;a(args.every(Number.isFinite));};
  if(key==='stroke')return()=>{strokes++;};if(key==='fillText')return()=>{};
  if(['setTransform','beginPath','moveTo','lineTo','setLineDash','save','restore','rect','clip'].includes(key))return()=>{};
  return target[key];},set(target,key,v){target[key]=v;return true;}});
 const canvas={clientWidth:1050,clientHeight:650,width:0,height:0,getContext:()=>ctx};
 a.equal(C.render(canvas,calc()),true);a(rectangles>96+72);a(strokes>20);
 a.equal(canvas.width,1050);
});
test('trading desk actually mounts canvas, status cards and all legends',()=>{
 const html=fs.readFileSync(require.resolve('../desk.html'),'utf8');
 const app=fs.readFileSync(require.resolve('../desk-app.js'),'utf8');
 for(const id of ['deskChart','opEntry','opStop','opTarget','opReward','setupChecks','setupVerdict','chartFootnote'])
 a(html.includes('id="'+id+'"'),id+' missing');
 a(html.includes('src="/desk-chart.js"'));
 a(app.includes("C.build({bars:state.bars"));
 a(app.includes("C.render($('deskChart'),model)"));
 a(app.includes("ticket?'Entrada límite teórica"));
});
