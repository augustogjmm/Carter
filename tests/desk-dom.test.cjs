const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
test('hidden grid panels do not display old asset levels',()=>{
 const css=fs.readFileSync(require.resolve('../desk.css'),'utf8');
 const app=fs.readFileSync(require.resolve('../desk-app.js'),'utf8');
 a.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important\s*\}/);
 const r=app.slice(app.indexOf('function renderScenario'),app.indexOf('function renderPositions'));
 a.match(r,/for\(const id of \['scenarioTrigger','scenarioStop','scenarioTarget','scenarioR'\]\)set\(id,'—'\)/);
 a.match(r,/\$\('scenarioPrices'\)\.hidden=true/);
 a.match(r,/\$\('scenarioPrices'\)\.hidden=false/);
});
