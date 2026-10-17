'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const context={window:{}};vm.createContext(context);
 for(const name of ['engine.js','research.js'])vm.runInContext(fs.readFileSync(name,'utf8'),context);
 const c=Array.from({length:1200},(_,i)=>{const p=100+i*.02+3*Math.sin(i/9);return{t:1577836800000+i*14400000,o:p,h:p+1,l:p-1,c:p+.1,v:100+i%17};});
 return{c,engine:context.window.CarterEngine,audit:context.window.CarterAudit};
}
test('actual Carter signal and filters do not change when future bars are appended',()=>{
 const {c,engine}=fixture(),full=engine.indicators(c,25,true);
 for(const n of [300,600,1000]){const prefix=engine.indicators(c.slice(0,n),25,true);for(const key of ['signal','fire','trend','momentumOK','adxOK'])assert.deepEqual(Array.from(prefix[key]),Array.from(full[key]).slice(0,n));}
});
test('trade export is opt-in and preserves all existing diagnostic aggregates',()=>{
 const {c,engine,audit}=fixture(),s=engine.indicators(c,25,true);s.__auditAdx=true;
 // Deterministic signal exercises execution rather than relying on a fixture
 // accidentally containing a naturally released squeeze.
 s.fire[400]=true;s.mom[400]=1;s.momentumOK[400]=true;
 const normal=audit.evaluate(c,s,0,'base',0,c.length,{useADX:true});
 const detailed=audit.evaluate(c,s,0,'base',0,c.length,{useADX:true,includeTrades:true});
 assert(!('trades' in normal));assert(detailed.trades.length>0);
 assert.equal(detailed.trades.length,detailed.n);
 const {trades,rejectionReasons,...aggregate}=detailed;assert.deepEqual(aggregate,{...normal});
 assert.deepEqual({...rejectionReasons},{});
 assert(Math.abs(trades.reduce((sum,t)=>sum+t.netR,0)-normal.totalR)<1e-12);
 for(const t of trades)assert(t.exitIndex>t.signalAt&&t.exitIndex<=t.signalAt+24);
});
