// Remote read-only PCS scan; the exact browser engine is used without a DOM.
const fs=require('node:fs'),vm=require('node:vm');
const BAR=14400000;
const context={window:{},fetch,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,console};
vm.createContext(context);
for(const f of ['pcs.js','scanner.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
const engine=context.window.PCSEngine,core=context.window.PCSScannerCore;
async function run(){
 const slot=Math.floor(Date.now()/BAR),lastCandle=(slot-1)*BAR;
 const ranked=await core.rank(),allowed=await core.exchange();
 const coins=ranked.coins,counts=new Map();
 for(const c of coins)counts.set(c.symbol,(counts.get(c.symbol)||0)+1);
 const duplicated=new Set([...counts].filter(([,n])=>n>1).map(([s])=>s));
 const items=coins.map(c=>{
  const gate=core.unscannable(c,allowed,duplicated);
  return {...c,status:gate?.status||'queued',reason:gate?.reason||'',available:allowed.has(c.symbol),A:false,B:false};
 });
 let next=0;
 async function worker(){
  while(next<items.length){
   const item=items[next++];if(item.status!=='queued')continue;
   try{
    const {bars,provider,gaps}=await engine.download(item.symbol+'USDT');
    const value=core.classify(bars);
    Object.assign(item,value,{provider,gaps,status:value.positionOpen?'position':value.signal?'signal':value.regime?'watch':'blocked'});
   }catch(e){Object.assign(item,{status:'error',available:false,reason:String(e.message||e)});}
   console.log(item.symbol,item.status);
  }
 }
 await Promise.all(Array.from({length:3},worker));
 if(Math.floor(Date.now()/BAR)!==slot)throw Error('El cierre cambió durante el escaneo: no publicar snapshot antiguo');
 const result={version:2,generatedAt:new Date().toISOString(),marketAt:new Date(ranked.at).toISOString(),lastCandle,items};
 fs.mkdirSync('data',{recursive:true});
 fs.writeFileSync('data/radar.json',JSON.stringify(result));
 const ok=items.filter(x=>['signal','watch','position','blocked'].includes(x.status)).length;
 if(!ok)throw Error('Ningún activo pudo analizarse: revisar conectividad');
 console.log(JSON.stringify({reviewed:items.length,analyzed:ok,errors:items.filter(x=>x.status==='error').length,signals:items.filter(x=>x.status==='signal').length}));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
