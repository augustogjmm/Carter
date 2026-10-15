# Auditoría Carter 4H — 15 de octubre de 2026

**Resultado:** ninguna de las tres variantes analizadas demuestra por ahora una ventaja estadística suficientemente sólida para considerarse sistema operativo. El modelo escalonado con perfil no generó operaciones válidas con sus reglas actuales.

## Pregunta

¿Permite Carter 4H proyectar una operación spot LONG con entrada, hasta tres compras, stop y take profit con expectativa estadística verificable?

**Respuesta:** no con la evidencia disponible. La interfaz de escenarios no sustituye la validación de órdenes hipotéticas efectivamente ejecutadas en el histórico.

## Datos, condiciones y reglas congeladas

Verificación de navegador sobre la aplicación conectada a la API pública de Binance, 15/10/2026:
- BTCUSDT, ETHUSDT, SOLUSDT, **4.799 velas cerradas de 4 horas por par**, entre 07/08/2024 y 15/10/2026.
- División cronológica **70 % entrenamiento / 30 % prueba posterior**, prueba desde 17/02/2026, sin utilizar el futuro del tramo de prueba para entrenar las reglas. Máximo 24 velas (96 horas) de seguimiento; al separar train/test se eliminan operaciones que necesitarían velas posteriores a la frontera.
- Ejecución en apertura de la vela siguiente a la señal confirmada. Comisión supuesta **0,10 % entrada + 0,10 % salida**. No se incluyen deslizamientos, gaps ni financiación.
- Si TP y SL son alcanzados dentro de la misma vela 4H, se asume **stop primero** (conservador). Una sola posición a la vez por variante.
- **Carter básico:** liberación de Squeeze ON→OFF, momentum de regresión positivo y creciente; SL 2 ATR, TP 3 ATR.
- **Carter EMA/ADX:** misma condición anterior más alineación EMA10 > EMA55 > EMA200, cierre sobre EMA10, ADX14 ≥25 y +DI > −DI; SL 2 ATR, TP 3 ATR.
- **Carter escalonado/estructural:** filtro anterior, E1 en apertura siguiente, E2/E3 solo tras recuperación del soporte, nuevo cierre confirmatorio 4H y compra en la siguiente apertura; TP en la primera resistencia observable y únicamente si el R/R desde E1 alcanza 1,5. SL debajo del último soporte y perfil aproximado derivado de las 4H precedentes.

**Importante:** estas tres reglas son definiciones de investigación v0.6. No equivalen necesariamente a la estrategia exacta de Trading Latino ni al script Python utilizado en las pruebas anteriores; los resultados no se comparan directamente con las otras simulaciones.

## Resultados de entrenamiento

| Par | Carter base: ops / PF / R total | EMA/ADX: ops / PF / R total | Perfil escalonado: ops |
|---|---|---|---:|
| SOLUSDT | 36 / 1,46 / +7,36R | 4 / 0,70 / -0,62R | 0 |
| BTCUSDT | 38 / 0,99 / -0,21R | 4 / 1,30 / +0,67R | 0 |
| ETHUSDT | 46 / 0,93 / -1,77R | 7 / 0,25 / -4,44R | 0 |

## Resultados fuera de muestra — tramo de prueba

| Par / modelo | Trades | % neto ganador | Profit Factor | Expectativa promedio | Drawdown en R |
|---|---:|---:|---:|---:|---:|
| SOL / Carter base | 15 | 46,7 % | 1,03 | +0,02R | 2,12R |
| SOL / EMA/ADX | 1 | 0 % | 0 | -1,04R | 1,04R |
| SOL / escalonado | 0 | — | — | — | 0 |
| BTC / Carter base | 18 | 50,0 % | 1,11 | +0,05R | 2,14R |
| BTC / EMA/ADX | 4 | 0 % | 0 | -1,09R | 4,36R |
| BTC / escalonado | 0 | — | — | — | 0 |
| ETH / Carter base | 16 | 31,3 % | 0,56 | -0,30R | 6,83R |
| ETH / EMA/ADX | 2 | 0 % | 0 | -1,06R | 2,12R |
| ETH / escalonado | 0 | — | — | — | 0 |

**Interpretación:**
1. Carter básico **no muestra robustez entre activos**: BTC y SOL apenas superan PF=1 en test, ETH pierde, y cada muestra de test es pequeña.
2. Agregar conjuntamente las EMA y ADX≥25 **reduce excesivamente el número de casos**. Los test de esta variante son desfavorables, pero no permiten afirmar nada definitivo por el escaso número de operaciones (1 a 4).
3. El modelo de perfil más tres compras registra **cero operaciones**: no es correcto mostrar sus E1/E2/E3 como una estrategia validada. Las condiciones de «Carter confirmado + perfil + R/R ≥1,5 en primera resistencia» no son operables bajo este diseño en este histórico.
4. No se ha medido aún la calibración predictiva de los intervalos estadísticos por régimen (P10/P50/P90). Son analogías descriptivas y no probabilidades comprobadas.
5. El volumen repartido uniformemente entre el mínimo y máximo de cada vela 4H **no es el volumen realmente negociado por precio**. No constituye order flow ni volumen de libro de órdenes. Convertirlo en tres supuestos soportes sin evaluar su capacidad predictiva aporta una falsa precisión.

## Fallas de diseño identificadas

- **Confusión señal versus ventaja:** una liberación de Squeeze implica expansión de volatilidad, no dirección ni rentabilidad aseguradas. El histograma de momentum es un filtro direccional, no una garantía de continuación.
- **TP elegido para cumplir un múltiplo:** elegir la primera resistencia evita la ilusión de atravesar obstáculos, pero combinado con stop lejano y 1,5R elimina todas las operaciones escalonadas. El filtro debe evaluarse como hipótesis, no ajustarse arbitrariamente hasta conseguir operaciones.
- **Promediar 3 entradas por defecto:** E2/E3 solo deberían permitirse cuando la evolución histórica confirma una mejora de la expectativa después de costos. Un precio medio menor NO prueba rentabilidad ni reduce el riesgo máximo.
- **Muestras pequeñas y mercados correlacionados:** tres pares no son tres experimentos independientes; BTC, ETH y SOL suelen compartir factores macro.
- **Diferencias con backtest inicial:** antes se reportaron resultados diferentes para Carter y Trading Latino. Se requiere una especificación escrita común de señal, ejecución, stops, TP y costos, para que la comparación sea reproducible.

## Criterios técnicos para la próxima validación

No promover ninguna nueva variante a «ENTRAR» hasta completar:
1. Definición reproducible de los tres disparadores (Carter original, variante Trading Latino, versión mejorada), incluida regla exacta de salida, eliminando divergencias de fórmula y ejecución.
2. Histórico multisímbolo de velas 4H y, si el volumen por precio debe afectar la entrada, **operaciones históricas reales agrupadas por precio**; distinguir claramente volumen estimado OHLCV de volumen verdadero.
3. Backtest de evento: desde señal detectada al cierre, esperar aperturas reales posteriores, simular E1/E2/E3 secuenciales solo si la vela confirma, y medir primera llegada al TP/SL, salidas temporales, comisiones y drawdown.
4. Estadísticas por par y por ventana temporal: **n de operaciones cerradas, % TP/SL, ganancia media R, PF, drawdown, tiempo de permanencia, MFE/MAE, proporción de ejecuciones E2/E3**, además de comparación E1-only contra escalonado con igual capital y riesgo.
5. Múltiples cortes cronológicos walk-forward y un período final **intocable durante ajustes**; resultados de test estables en varios activos, no una ganancia aislada en un solo par.
6. Concluir «SIN VENTAJA DEMOSTRADA» si las reglas no superan la prueba. Evitar inventar TP o forzar tres compras.

## Estado de la aplicación

En v0.6, GitHub Actions pasa tests sintéticos y Vercel publica los archivos. Una prueba de navegador comprobó que Binance entregó las 4.799 velas reales y que las tres variantes mostraron los resultados indicados. Después se cambió la etiqueta operativa para que una señal técnicamente válida, pero no validada estadísticamente, figure como **SEÑAL EN ESTUDIO** en lugar de **ENTRAR**.

**Decisión del estudio:** no autorizar trading automático ni señales de «entrar» basadas en este modelo hasta obtener evidencia real fuera de muestra. Mantener solo el análisis descriptivo de escenarios 4H.
