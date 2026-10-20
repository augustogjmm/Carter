const test=require('node:test'),assert=require('node:assert/strict'),R=require('../desk-replay.js');
const H4=14400000,DAY=86400000,start=Date.UTC(2026,9,20,12,0),n4=450,nD=400;
const four=Array.from({length:n4},(_,i)=>({t:start-(n4-1-i)*H4,o:100,h:101,l:99,c:100,v:1000}));
const days=Array.from({length:nD},(_,i)=>({t:Date.UTC(2026,9,20)-nD*DAY+i*DAY,o:110,h:111,l:109,c:110,v:1000}));
const pretend={valid:Array(n4).fill(true),long:Array(n4).fill(false),ema55:Array(n4).fill(98),atr:Array(n4).fill(2)};
const trend={valid:Array(nD).fill(true),ema10:Array(nD).fill(120),ema55:Array(nD).fill(105)};
test('candidate uses only the closed daily bar known before 4h signal',()=>{
 const i=420;pretend.long[i]=true;
 const out=R.planAt(four,days,i,pretend,trend);
 assert(out);
 assert(out.dailyKnownAt<=out.signalAt);
 assert.equal(out.signalAt,four[i].t+H4);
 assert(out.profile.quality.includes('ESTIMADO'));
 assert(out.stop>0&&out.maxChase>four[i].c);
});
test('later daily changes cannot rewrite the earlier candidate',()=>{
 const i=420;pretend.long[i]=true;
 const first=R.planAt(four,days,i,pretend,trend);
 const changed=days.map(b=>({...b}));
 const t=first.signalAt;
 for(let j=0;j<changed.length;j++)if(changed[j].t+DAY>t)changed[j].c=1000000;
 const after=R.planAt(four,changed,i,pretend,trend);
 assert.deepEqual(after,first);
});
test('real-indicator replay is deterministic and fail closed for sparse evidence',()=>{
 const args={from:four[220].t,to:four.at(-1).t+H4};
 const a=R.replay(four,days,args),b=R.replay(four,days,args);
 assert.deepEqual(a,b);
 assert.equal(a.causal,true);
 assert.equal(a.model,'DESK_MARKET_ONLY_REPLAY');
 const verdict=R.judge(a,R.replay(four,days,{...args,fee:.002,slip:.001}));
 assert.equal(verdict.verdict,'NO_APROBADA_PARA_EJECUCION_REAL');
 assert(verdict.reasons.includes('Menos de 30 operaciones cerradas fuera de muestra'));
});
