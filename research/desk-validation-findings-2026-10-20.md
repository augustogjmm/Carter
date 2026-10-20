# Carter Desk — Hallazgos de implementación y validación al 20/10/2026

## Estado ejecutivo

**NO APROBADO PARA EJECUCIÓN REAL.** La aplicación web es un prototipo operativo de consulta y bitácora, no una estrategia de entradas con ventaja estadística comprobada. Se descartó explícitamente anunciar "100 %" o activar órdenes automáticas.

Datos técnicos verificados: publicación en Vercel READY; lectura de cotizaciones y filtros de Binance; 50 filas clasificadas en el radar, de las cuales 29 tenían par spot utilizable con datos para análisis al último cierre verificado; secuencia unificada GitHub Actions TL+Desk terminada en verde, y pruebas unitarias/causalidad terminadas en verde. La ausencia de candidato verde sigue siendo un resultado correcto si ningún activo alcanza las reglas.

## Auditoría market-only del modelo actual

Archivos: data/desk-audit/summary.json, scripts/desk-audit.cjs, desk-replay.js.

- Reglas explícitamente experimentales: EMA 10/55 + momentum LazyBear + ADX Wilder TL-BASE; confirmación 1D cerrada; 4H cerrada; perfil de volumen aproximado desde OHLCV, 360 barras de 4H; stop estructural; objetivo igual a la resistencia confirmada superior más cercana; mínimo 1,5 R; límite de exposición 20 %; riesgo 1 %; comisiones 0,1 % y slippage supuesto 0,05 % por ejecución; ventana hasta la próxima vela 4H.
- Datos: BTCUSDT y ETHUSDT de Binance Spot, 4H y 1D, desde 2020.
- Ventanas: train 2020–22; validación 2023–24; test 2025–20/10/2026; estrés de costos 2x.
- BTC test: 14 señales TL-BASE, **0 elegibles**, 0 operaciones cerradas. Vetos: **12 fuera de zona de volumen**, 1 por relación R insuficiente, 1 tendencia diaria.
- ETH test: 12 señales TL-BASE, **0 elegibles**, 0 operaciones cerradas. Vetos: **6 fuera de zona de volumen**, 4 por tendencia diaria, 2 por relación R insuficiente.
- Train: BTC 25 señales, 0 elegibles; ETH 31 señales, 0 elegibles. Validación: BTC 29 señales, 1 elegible, 1 cerrada con resultado neto aproximado -0,414 % sobre capital; ETH 18 señales, 0 elegibles.

**Interpretación:** no se demostró edge. La simulación no dispone de spreads, libro de órdenes histórico L2, latencias, fills parciales ni perfiles exactos por precio, por lo que es una auditoría parcial de mercado y no una certificación de ejecutabilidad.

## Nueve variantes de perfil y volumen

Archivo: data/desk-variants/summary.json. Son combinaciones **predefinidas en código antes de ejecutar esta matriz** de 120, 240 y 360 barras de perfil, y tres políticas: estricta, ampliada (*buffer*) y solo observacional.

Se evaluaron solamente train 2020–22 y validación 2023–24. Los resultados 2025–2026 de la hipótesis base **ya habían sido observados** antes de lanzar este experimento, por lo que no deben presentarse como un nuevo test ciego para seleccionar variantes.

**Ninguna variante cumple los criterios establecidos en BTC y ETH.** Incluso sin veto de volumen, BTC TRAIN 25 señales/0 elegibles, ETH TRAIN 31 señales/0 elegibles; al retirar el bloqueo de volumen, la mayoría de las señales pasa a fallar por **relación de beneficio/riesgo insuficiente hasta la resistencia más cercana**, no por falta de disparadores.

Por tanto, no se promovió ninguna variante a producción.

## Producto: lo que sí se implementó

- Radar Top 50 por ranking CoinGecko, valores reales Spot Binance, distinción de excluidos/sin par/error/esperar/vigilar; snapshot programado cada cierre de vela 4H.
- Motor independiente de viabilidad con datos 1D/4H, bid-ask, profundidad L2 *actual* (no histórica), mínimo de liquidez, spread, filtros de tamaño, precios redondeados por tick, stop, objetivo, R neto, capital y exposición.
- Orden límite propuesta como **hipótesis no validada**, con caducidad y recotización en el momento de preparar.
- Bitácora local donde preparar/enviar una orden no implica un fill; registro manual explícito, operaciones parciales, seguimiento de posición, stop/objetivo, deterioro de momentum/EMA55, PnL, importación y exportación JSON; avisos del navegador con página abierta.
- Protección de duplicados de la misma señal y reservas de riesgo para tickets pendientes.
- Pruebas automatizadas y smoke de navegador confirmaron panel de auditoría, radar y análisis de BTC. No se verificó completamente una compra real en Binance: no existe API privada ni se han enviado órdenes.

## Lo que impide certificar el producto

1. No existe un motor de entradas que haya aprobado el protocolo cuantitativo. Crear señales más frecuentes no equivale a crear oportunidades buenas.
2. El criterio de objetivo/salida de Carter (resistencia inmediata y TP fijo) no está demostrado como interpretación fiel del método discrecional de Jaime; el material investigado describe salidas ante patrones opuestos y lectura estructural.
3. Perfil OHLCV estimado de 360 velas no equivale al perfil de sesión/rango visible ni a volumen exacto por operación. No se ha auditado una reconstrucción aggTrades suficientemente amplia.
4. No hay cuenta autenticada segura ni conciliación read-only de fills de exchange, y la bitácora solo es local al navegador.
5. El monitoreo privado de posiciones y avisos no continúa con la pestaña cerrada; solo el radar público se calcula remotamente.
6. No está implementado el universo de CEDEARs con datos y horarios de mercado verificables.
7. Carecemos de muestra prospectiva suficiente para aprobar otra estrategia.

## Política de desarrollo

No reducir automáticamente las reglas de volumen, stop o R para fabricar candidaturas verdes. Primero se debe reconstruir y cotejar con fuentes originales cómo se ancla el perfil de volumen, qué patrones causan entradas y **qué evento produce la salida**; después definir variantes congeladas y medir train/validación/holdout o datos prospectivos no observados. Toda función sin datos verificables debe mostrar SIN DATOS, no recomendaciones.

**Objetivo de aceptación del producto:** no basta Vercel READY ni CI verde. La mesa debe emitir una entrada actual con precios/filtros verificables, demostrar un comportamiento causal y una auditoría fuera de muestra aprobada, permitir registrar el fill real y llevar el seguimiento hasta salida con persistencia/alertas conforme al nivel de servicio prometido.

Fuentes internas: workflows GitHub Actions Carter (Unified Top 50, Desk CI, Independent market replay, Fixed volume variants); archivos JSON publicados, con fecha de generación y versionado.
