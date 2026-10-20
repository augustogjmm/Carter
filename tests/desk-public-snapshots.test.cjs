const test=require('node:test'),assert=require('node:assert/strict'),S=require('../scripts/desk-public-snapshots.cjs');
const H4=14400000,DAY=86400000;
function p(ms){const end=Date.UTC(2026,9,20,12);return {source:'Binance Spot data-api.binance.vision',
 bars:Array.from({length:260},(_,i)=>({t:end-(259-i)*ms,o:20,h:21,l:19,c:20,v:100}))};}
test('public chart exports only closed, regular verified Binance history',()=>{
 assert.equal(S.check(p(H4),'4h',Date.UTC(2026,9,20,12)).length,260);
 assert.throws(()=>S.check({...p(H4),source:'OKX Spot'},'4h',Date.UTC(2026,9,20,12)),/Binance/);
 assert.throws(()=>S.check(p(H4),'4h',Date.UTC(2026,9,20,8)),/desactualizado/);
 const v=p(H4);v.bars[255].t-=H4;assert.throws(()=>S.check(v,'4h',Date.UTC(2026,9,20,12)),/Huecos/);
 assert.equal(S.check(p(DAY),'1d',Date.UTC(2026,9,20,12)).length,260);
});