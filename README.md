# PCS 4H · Producto integrado

Entrada principal: https://carter-rust.vercel.app/pcs.html. Carter anterior se conserva en index.html.

## Actualización 17/10/2026

- Radar y gráfico usan el mismo histórico desde 2020 o desde el listado del activo, el mismo motor y la misma caché por cierre. Se elimina la discrepancia de simular 1000 velas en el radar y todo el histórico en el detalle.
- Escaneo remoto GitHub Actions cada 4 horas a minuto 7 UTC, además de cada cambio del motor. Guarda data/radar.json y el despliegue conectado lo publica. La programación puede demorarse por la cola del proveedor. El navegador rechaza snapshots de otro cierre y analiza directamente si falta el vigente.
- La descarga tiene límites de tiempo y respaldo por API del mismo sitio, con endpoints de mercado restringidos. No existen órdenes ni credenciales de exchange.
- La pantalla limpia gráficos, niveles y señales antes de cambiar de activo. Una falla muestra SIN DATOS y no conserva el plan anterior.
- Solo velas cerradas, validación OHLCV, deduplicación, vigencia del último cierre y continuidad en las últimas 350 barras. Los huecos históricos anteriores siguen visibles en la cobertura del backtest y no se presentan como una serie íntegra.
- Modo inicial contado 1×. El modo matemático original 3× sigue disponible, etiquetado como teórico. El sizing no modifica las reglas de señal.
- Señales al cierre i; ejecución teórica en apertura i+1. Verde indica señal cerrada con sistema teórico FLAT, no un precio de compra actual. No se modifica PCS para generar más verdes.
- Una posición por activo, stop prioritario, TP1 50%, breakeven y trailing desde la siguiente vela. El backtest no registra compras reales del usuario.
- Pruebas: node --test tests/product.test.cjs; smoke heredado en validate.yml; escaneo real independiente en scan.yml.

La funcionalidad del producto y la rentabilidad de la estrategia son comprobaciones distintas. La auditoría cuantitativa independiente C1–C10 continúa pendiente; no se certifica un porcentaje de acierto ni una rentabilidad.

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

Primera ejecución remota del 17/10/2026: 50 filas, 28 activos calculados, 10 excluidos, 11 sin par spot Binance y HYPE sin histórico suficiente accesible. Es un estado variable del proveedor, no un resultado inventado. Los activos sin cobertura permanecen visibles y sin señales.

Las posiciones son teóricas, reconstruidas desde el histórico disponible; no equivalen a tenencias del usuario. Las estadísticas FULL/IS/OOS del panel son segmentos de esa simulación continua, no una réplica de ventanas independientes de la auditoría C1–C10. No hay ejecución de órdenes, seguimiento de una cuenta real ni rentabilidad garantizada.
