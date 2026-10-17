"""Execute the unchanged quantitative protocol; disclose data failures explicitly.

Observed historical gaps are never filled with fabricated candles. Their results
are exploratory and cannot pass the strict data integrity/causality gate.
"""
import json
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import pandas as pd
import pcs_verificador_independiente as audit

out=Path('data/audit');out.mkdir(parents=True,exist_ok=True)
cache=Path('audit_cache');cache.mkdir(exist_ok=True)
audit.selftest()
datasets={};failures=[];quality=[]
spec=[('BTCUSDT','4h','2020-01-01'),('ETHUSDT','4h','2020-01-01'),
      ('BTCUSDT','1h','2022-01-01'),('ETHUSDT','1h','2022-01-01'),
      ('BTCUSDT','15m','2024-01-01'),('ETHUSDT','15m','2024-01-01'),
      ('SOLUSDT','4h','2021-01-01'),('BNBUSDT','4h','2021-01-01')]
for sym,tf,first in spec:
 print('DATA',sym,tf,flush=True)
 try:
  df,fp=audit.get_data(sym,tf,pd.Timestamp(first,tz='UTC'),audit.END_UTC,cache)
 except RuntimeError as e:
  # get_data has already saved the actual exchange bars before rejecting gaps.
  # Retain that strict failure while measuring on the observed sequence.
  if not str(e).startswith('Detectados '):
   failures.append({'symbol':sym,'tf':tf,'error':str(e)});continue
  path=cache/f'{sym}_{tf}_{first[:4]}_{audit.END_UTC.strftime("%Y%m%d")}.csv'
  df=pd.read_csv(path)
  step=audit.INTERVAL_MS[tf];diff=np.diff(df.t.to_numpy(dtype=np.int64))
  gaps=[{'before':int(df.t.iloc[i]),'after':int(df.t.iloc[i+1]),'missing':int(diff[i]//step-1)} for i in range(len(diff)) if diff[i]!=step]
  fp={'symbol':sym,'tf':tf,'source':'Binance public data API','bars':len(df),'first':int(df.t.iloc[0]),'last_open':int(df.t.iloc[-1]),'gaps':gaps,'strict_integrity':'FAIL','sha256_csv':__import__('hashlib').sha256(path.read_bytes()).hexdigest()}
  quality.append(fp)
  if int(df.t.iloc[-1])!=(audit.ts_ms(audit.END_UTC)//step-1)*step:
   failures.append({'symbol':sym,'tf':tf,'error':'Stale series'});continue
 datasets[(sym,tf)]=(audit.indicators(df),fp)
 print('READY',sym,tf,len(df),'gaps',len(fp.get('gaps',[])),flush=True)

flags=SimpleNamespace(spot_only=False,seed=20261016)
if not all((s,'4h') in datasets for s in ['BTCUSDT','ETHUSDT']):
 raise RuntimeError('No real BTC/ETH 4H data; refusing to invent audit results: '+json.dumps(failures))
print('RUNNING full protocol, 108 combinations per asset, 5000 permutations',flush=True)
rows,mc,fps=audit.run_all(datasets,flags)
criteria,details=audit.verdicts(rows,mc)
if quality or failures:
 criteria['C4']=False
details.update(data_quality_failures=quality,download_failures=failures,
               methodology='Historical gaps preserved as observed. Strict integrity failed where indicated; results there are exploratory, never certified.')
verdict='RECHAZADA' if sum(not bool(x) for x in criteria.values())>=3 or quality or failures else 'REQUIERE REVISIÓN METODOLÓGICA'
rows.to_csv(out/'todas_las_pruebas.csv',index=False);mc.to_csv(out/'montecarlo.csv',index=False)
(out/'fingerprint.json').write_text(json.dumps(fps,indent=2,ensure_ascii=False))
(out/'criterios.json').write_text(json.dumps({'criteria':{k:bool(v) for k,v in criteria.items()},'details':details},indent=2,ensure_ascii=False))
report=audit.report_md(rows,mc,fps,criteria,details)
report='# Dictamen final: '+verdict+'\n\nAuditoría ejecutada con datos reales. No equivale a aprobación de rentabilidad.\n\n'+report
(out/'INFORME.md').write_text(report)
spotrows=[]
for sym in ['BTCUSDT','ETHUSDT']:
 d=datasets[(sym,'4h')][0]
 for label,a,b in [('FULL',audit.START_UTC,audit.END_UTC),('IS',audit.START_UTC,audit.SPLIT_UTC),('OOS',audit.SPLIT_UTC,audit.END_UTC)]:
  spotrows.append(audit.outrow(sym,label,'PCS spot 1x',audit.run_engine(d,audit.Params(spot_only=True),a,b)))
spot=pd.DataFrame(spotrows);spot.to_csv(out/'spot_1x.csv',index=False)
summary={'completed':True,'generatedAt':audit.NOW_UTC.isoformat(),'verdict':verdict,'criteria':{k:bool(v) for k,v in criteria.items()},'experiments':len(rows),'datasets':len(fps),'dataQualityFailures':len(quality),'downloadFailures':failures,
 'spotBase':json.loads(spot.to_json(orient='records')),
 'base':json.loads(rows[rows.experiment=='PCS'].to_json(orient='records'))}
(out/'summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))
print('VERDICT',verdict,flush=True);print(json.dumps(summary,ensure_ascii=False),flush=True)
