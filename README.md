# Carter — Mesa Operativa Premium (20/10/2026)

**Acceso directo:** https://carter-rust.vercel.app/desk.html

La mesa es un módulo adicional; no sustituye ni modifica los motores congelados Carter y PCS. Cripto spot long-only: contexto **1D cerrado** y señal experimental TL-BASE en **4H cerrada**. El motor independiente decide la viabilidad **en el momento de consulta** mediante cotización bid/ask y reglas spot Binance, datos completos, ventana temporal, perfil de volumen **estimado OHLCV**, stop de estructura, resistencia medible, mínimo 1,5R neto estimado y límites de riesgo. Si una sola restricción falla, no se genera ticket.

**Advertencia de evidencia:** la regla automatizada es una hipótesis propia de Carter, no una especificación oficial completa de Jaime. La rentabilidad futura no está demostrada, no existe auditoría externa concluyente de este motor y el ticket se muestra como CANDIDATO / EXPERIMENTAL, no como recomendación certificada. No se transmiten órdenes al exchange.

**Motor y UI:** desk-engine.js (decisiones causales), api/desk-quote.js (precios, spread, volumen 24h, filtros spot en vivo), desk.html, desk.css, desk-app.js (radar público Top50, contexto, gráfico, ticket y administración manual). La fuente de verdad de las 50 posiciones del ranking es data/tl-radar.json. Un solo pipeline programado, .github/workflows/tl-scan.yml, ejecuta secuencialmente scripts/tl-scan.cjs y scripts/desk-scan.cjs y publica juntos data/tl-radar.json y data/desk-opportunities.json. .github/workflows/desk-scan.yml queda exclusivamente como diagnóstico manual sin escrituras al repositorio, para evitar carreras de publicación y correos de fallos por commits simultáneos. La consola reválida precio/orden al abrir cada candidato; no reutiliza quotes del escaneo como órdenes actuales.

**Bitácora:** desk-ledger.js almacena localmente, en ese navegador, tickets preparados y fills **confirmados manualmente**. Preparar/enviar no crea una posición; un fill explícito sí. Admite compras parciales, ventas parciales, costos y PnL realizado. El seguimiento con bids públicos se actualiza con la página abierta; ofrece exportación JSON. **No existe aún persistencia cifrada multi-dispositivo, conciliación bancaria/exchange read-only, monitoreo privado del usuario con la página cerrada ni push móvil.** Esas capacidades requieren backend autenticado y verificación adicional; no deben presentarse como terminadas.

**Verificación automatizada:** node --test tests/desk.test.cjs tests/tl-engine.test.cjs; GitHub Actions desk-validate.yml para pruebas por cambios, tl-scan.yml para escaneo sincronizado cada 4 horas y desk-scan.yml solo para diagnóstico manual. El pipeline unificado requiere confirmación en su próxima ejecución programada. El despliegue Vercel automático presenta la UI, pero código desplegado no demuestra estrategia rentable ni un servicio de órdenes.

---

# PCS 4H · Producto integrado

Entrada principal: https://carter-rust.vercel.app/pcs.html. Carter anterior se conserva en index.html.

## Revisión y seguimiento prospectivo

Comparación integrada: https://carter-rust.vercel.app/review.html. Siete modelos fijos, cuatro activos y seis tramos, más walk-forward no solapado, costos altos y bootstrap de 5.000 rutas por modelo/activo. B&H y DCA se muestran como referencias de exposición distinta.

Donchian21 fue elegido por su peor Calmar entre BTC y ETH en 2020–2022. No superó los controles posteriores, especialmente en ETH. Ninguna alternativa cumplió todos los requisitos; no se promovió otro motor usando los mejores resultados de test. Las reglas se fijan en research/review_protocol.json. Esta revisión es retrospectiva y declara que los agregados OOS ya habían sido observados.

La causalidad se verifica mediante 140 prefijos reales de los siete modelos. Se separa esa prueba de la sensibilidad a retardar entradas y de los huecos de datos; no se modifica el dictamen histórico del protocolo original.

Registro prospectivo: 28 cuentas teóricas (7 modelos × BTC/ETH/SOL/BNB), con capital simulado independiente de 1.000 USDT, riesgo 1%, exposición máxima 1× y comisión 0,10% por fill. Inicio fijo 17/10/2026 13:37:07 UTC. El proceso programado corre cada cuatro horas a minuto 9, incluso con la página cerrada. No incorpora señales anteriores al inicio ni envía órdenes reales. Persiste estado y eventos sin reiniciar el historial; una modificación del protocolo bloquea el reinicio silencioso. Las reconstrucciones por demoras quedan identificadas.

El ledger se prueba contra los siete backtests independientes antes de la liquidación terminal. La muestra prospectiva mínima indicada (tres meses y 20 operaciones cerradas por activo) no implica aprobación ni garantiza que se alcance una ventaja. No puede completarse con datos futuros que aún no existen.

## Hipótesis de contexto diario

Se ejecutó una segunda hipótesis, declarada en research/mtf_protocol.json: ocho variantes que combinan señales 4H con un régimen diario cerrado. La única candidata se elige por entrenamiento BTC/ETH 2020–2022; luego se evalúa en períodos posteriores y en XRP/ADA/AVAX/LTC, que no participan en esa selección. Se conserva el riesgo 1%, contado 1× y los criterios de aprobación. Los 240 controles de prefijos incluyen el momento exacto en que un día completo pasa a estar disponible, evitando usar el cierre diario antes de tiempo. Datos y decisión en data/mtf-study/; no altera el estudio prospectivo anterior.

## Actualización 17/10/2026

- Radar y gráfico usan el mismo histórico desde 2020 o desde el listado del activo, el mismo motor y la misma caché por cierre. Se elimina la discrepancia de simular 1000 velas en el radar y todo el histórico en el detalle.
- Escaneo remoto GitHub Actions cada 4 horas a minuto 7 UTC, además de cada cambio del motor. Guarda data/radar.json y el despliegue conectado lo publica. La programación puede demorarse por la cola del proveedor. El navegador rechaza snapshots de otro cierre y analiza directamente si falta el vigente.
- La descarga tiene límites de tiempo y respaldo por API del mismo sitio, con endpoints de mercado restringidos. Binance es la fuente primaria, con Bybit y KuCoin spot como respaldo explícito. No se mezclan velas de exchanges distintos en una misma serie. No existen órdenes ni credenciales de exchange.
- La pantalla limpia gráficos, niveles y señales antes de cambiar de activo. Una falla muestra SIN DATOS y no conserva el plan anterior.
- Solo velas cerradas, validación OHLCV, deduplicación, vigencia del último cierre y continuidad en las últimas 350 barras. Los huecos históricos anteriores siguen visibles en la cobertura del backtest y no se presentan como una serie íntegra.
- Modo inicial contado 1×. El modo matemático original 3× sigue disponible, etiquetado como teórico. El sizing no modifica las reglas de señal.
- Señales al cierre i; ejecución teórica en apertura i+1. Verde indica señal cerrada con sistema teórico FLAT, no un precio de compra actual. No se modifica PCS para generar más verdes.
- Una posición por activo, stop prioritario, TP1 50%, breakeven y trailing desde la siguiente vela. El backtest no registra compras reales del usuario.
- Pruebas: node --test tests/product.test.cjs; smoke heredado en validate.yml; escaneo real independiente en scan.yml.

La auditoría independiente C1–C10 se ejecutó el 17/10/2026 con 8 series reales y 320 escenarios, más la variante de contado 1×. Dictamen final: **RECHAZADA bajo los criterios definidos**, con cuatro series que presentan huecos históricos declarados. Los resultados medidos y las limitaciones se publican en audit.html y data/audit/. No se certifica rentabilidad futura. La implementación del motor no transforma un dictamen desfavorable en aprobación.

## Reglas congeladas

Señal solo al cierre 4H y entrada en apertura siguiente. Régimen: cierre > EMA200 y EMA50 creciente respecto de 5 velas atrás.

- A: squeeze BB20/2 dentro de KC EMA20 ± 1,5 ATR20 en las últimas 16 barras, cierre supera el máximo previo de 21, ADX14 ≥18, volumen >1,3 SMA20.
- B: EMA10 > EMA50, mínimo ≤EMA10, cierre >apertura, ADX14 ≥20.
- ATR20 es SMA del True Range; ADX usa Wilder. Sin información futura.
- Stop inicial 1,5 ATR, TP1 a +1R por 50%, breakeven tras TP1, trailing 2,5 ATR calculado al cierre para la próxima vela, salida temporal a las 300 barras. Stop antes que TP; gap adverso a apertura; comisión 0,10% en cada fill.

## Uso

Abrir PCS, esperar la revisión y seleccionar «Ver gráfico» en cualquier activo con datos. Las filas verdes corresponden a señales confirmadas en el último cierre, amarillo a vigilancia y las restantes explican el bloqueo o la falta de cobertura. «Solo verdes» filtra oportunidades sin reemplazar monedas excluidas. Reanalizar fuerza consultas actuales; la carga normal primero verifica el snapshot remoto vigente.

El gráfico muestra EMA10/50/200, BB/KC opcionales, volumen, ADX/DI, señales A/B y fills simulados E/TP1/SL. Rueda para zoom, arrastrar para recorrer y doble clic para volver al final. Sin señal ni posición, no presenta niveles como órdenes.

Carter anterior mantiene su motor, perfil de volumen estimado y escenarios propios. No se fusionan con las reglas PCS.

## Cobertura y límites observados

Escaneo remoto verificado del 17/10/2026 13:31 UTC: 50 filas, 29 activos calculados, 10 excluidos, 11 sin par spot Binance y cero errores de descarga. HYPE se calculó con KuCoin spot y sin huecos. Los activos sin par y los excluidos permanecen identificados; no se sustituyen por monedas fuera del top 50.

Las posiciones son teóricas, reconstruidas desde el histórico disponible; no equivalen a tenencias del usuario. Las estadísticas FULL/IS/OOS del panel son segmentos de esa simulación continua. La auditoría publicada sí reinicia las ventanas de manera independiente. No hay ejecución de órdenes, seguimiento de una cuenta real ni rentabilidad garantizada.
### Diagnóstico del Carter real

`research/carter_actual.py` ejecuta `engine.js` y `research.js` directamente mediante Node, sin reinterpretar sus señales. Publica estadísticas en R de los tres modelos históricos de la aplicación, ocho activos y ventanas de calendario, junto con operaciones y SHA-256 del código. Prueba invariancia por prefijos de cinco campos causales. No selecciona un ganador ni aprueba el sistema: el simulador original excluye slippage y gaps de ejecución y no calcula una cartera comparable al estudio PCS. La vista está en `review.html#carter-actual`.

## Estrategia Trading Latino — módulo aislado (implementación 19/10/2026)

Ruta nueva: `/trading-latino.html`. Mantiene los motores Carter (`engine.js`) y PCS (`pcs.js`) sin modificaciones de sus reglas.

`tl-engine.js`: EMA10/55 y EMA200 opcional, Squeeze Momentum LazyBear (SMA BB/KC + LinReg20), Wilder ADX14 (+DI/−DI), señales TL-BASE long/bear al cierre, backtest de solo largos spot 1x y volumen aproximado OHLCV. `tl-data.js`: Top 50 real CoinGecko, mercados Binance Spot USDT, descarga paginada desde 2020 y chequeos de continuidad. `tl-app.js`: radar y velas 1H/4H/1D, perfil, ADX, momentum, estado, simulación y contexto multi-timeframe. `scripts/tl-scan.cjs` y `.github/workflows/tl-scan.yml`: escaneo remoto independiente después del cierre 4H, a minuto 11 (puede sufrir demoras del scheduler).

**Regla long del proyecto (NO atribuible directamente a Jaime):** EMA10>EMA55, MOM[t]>MOM[t-1], MOM[t-1]<=MOM[t-2], MOM[t-1]<0, ADX[t]<ADX[t-1], ADX[t-1]>=23, todos los datos confirmados. No exige squeeze ON. Entrada teórica al siguiente open; stop −1,5 ATR14, TP +2R, 1% de riesgo como objetivo, 100% exposición máxima, comisión 0,10% y slippage 0,05% por ejecución. Si SL y TP se tocan en la misma vela, prevalece SL. Señal bajista permite salida al open siguiente. Una operación por activo; E2/E3 aún no implementadas.

**Importante:** este módulo todavía no tiene un informe auditado independiente de rendimiento fuera de muestra ni una certificación de ventaja estadística. El backtest completo que muestra la UI es exploratorio, no PASS. Solo el resultado de las pruebas en CI y la validación de datos en producción pueden determinar qué componentes se consideran operativos. Ningún estado verde debe interpretarse como orden de mercado; la apertura posterior al cierre de la señal puede haber sucedido.
