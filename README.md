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

# Carter 4H y PCS · Workstation

Aplicación estática: https://carter-rust.vercel.app . Conectada al repositorio y desplegada automáticamente por Vercel desde la rama main.

## Radar top 50 y PCS Squeeze Regime Pro (16/10/2026)

La vista PCS incluye una tabla top 50 ordenada por capitalización de CoinGecko (snapshot actual obtenido por /api/top50, cacheado aproximadamente 15 min en Vercel). Se muestran **exactamente 50** activos (incluidas stablecoins, tokens envueltos y activos sin par spot); los no aplicables o no listados se identifican como tales, nunca se sustituyen por otros tickers. Consulta el catálogo de Binance spot USDT y analiza hasta 1000 velas cerradas 4H por par disponible, con un máximo de cuatro consultas simultáneas. Señales verdes solo cuando hay puerta A/B, régimen y simulación FLAT; si el sistema mantiene un LONG teórico, indica LONG PREVIO, nunca una nueva entrada. Las señales en verde **se refieren al cierre de la última vela 4H, no a un precio de compra vigente**. El radar actualiza al cerrar una nueva vela 4H y refresca el ranking pasado una hora, **solo mientras esté abierto el navegador**. Maneja datos obsoletos, errores de API, ausencia de pares y reintentos sin inventar precios ni mantener verdes antiguos.

## Nueva vista PCS Squeeze Regime Pro (16/10/2026)

- **Enlace:** [PCS 4H](https://carter-rust.vercel.app/pcs.html), disponible desde la pestaña «PCS · nueva» en Carter. El modelo Carter original se conserva en index.html.
- **Universo fijo:** BTCUSDT y ETHUSDT, spot 4H con velas cerradas desde 2020-01-01 UTC. Binance Spot paginado hasta última vela completa, respaldo Bybit spot (marcado explícitamente si no cubre el histórico); revisión de duplicados, saltos y fechas.
- **Indicadores independientes:** EMA 10/50/200, SMA20 y sigma poblacional BB, Keltner EMA20 ± 1,5×ATR20 (ATR como SMA de TR), ADX14/DI Wilder, volumen > 1,3×SMA20 y priorHH21 excluyendo vela actual.
- **Señales:** régimen Cierre > EMA200 y EMA50 creciente (5 velas), puerta A de squeeze ON en últimas 16 + ruptura + ADX18 + volumen, o puerta B de rebote EMA10 con vela verde y ADX20. El gráfico identifica A/B y diferencia condiciones parciales de señales confirmadas.
- **Ejecución visual, no órdenes:** entrada en apertura siguiente, stop 1,5 ATR del cierre señal, TP1 +1R en mitad de la posición, stop a breakeven, trailing 2,5 ATR tras TP1 desde vela siguiente, límite 300 velas, stop prioritario a TP, fee 0,10% por fill. No se ofrece E2/E3 ni promedio.
- **Exposición:** 3× reproduce sizing PCS matemático, pero **no es spot al contado sin margen**; se ofrece una variante opcional 1× que incorpora fee de entrada en el techo de capital y no debe confundirse con la réplica original.
- **Métricas exploratorias:** FULL, IS y OOS sobre las velas que efectivamente descarga el navegador, marcado a mercado y comisiones; datos incompletos explícitamente señalizados. Este módulo es una visualización local, **NO certifica la validación independiente C1–C10 ni confirma los números originales**.
- **Límites:** el cierre de la señal coincide con la apertura de la vela siguiente. Si se observa una señal ya cerrada, ese precio de apertura puede haber pasado. Una línea condicional basada en el último cierre NO es un precio futuro conocido.

## Qué se proyecta (siempre 4H)

El panel principal muestra escenarios futuros condicionados por la estructura: retroceso a E1, continuación sin retroceso e invalidación. La zona sombreada a la derecha de las últimas velas representa las posibles secuencias de niveles, **sin plazos estimados ni probabilidades**. Cada compra exige confirmación 4H posterior: un toque del soporte no ejecuta ni autoriza una compra. No se generan precios futuros inventados: los puntos corresponden a precio actual, soportes, resistencias y stop calculados.

Se comparan las operaciones hipotéticas con E1, E1+E2 y E1+E2+E3: promedio, exposición, resultado al TP y al SL descontando una comisión aproximada total de 0,20%. El TP debe estar en la **primera resistencia relevante**, no se salta una resistencia próxima para simular mejor beneficio/riesgo. Si el primer obstáculo no ofrece R/R suficiente, se descarta la entrada.

Estos escenarios sirven para **preparar decisiones**, no predicen qué dirección tomará el mercado. Sin backtest específico no hay una tasa de éxito válida para el modelo escalonado.

## Referencia cuantitativa 4H (v0.5)

Con hasta 2000 velas cerradas 4H se buscan regímenes históricos parecidos (tendencia EMA, signo del momentum, direccionalidad DI y fuerza ADX, con relajación explícita si la muestra es pequeña). Solo se muestran resultados cuando hay **al menos 30 observaciones**. Se visualiza:
- Precio de cierre mediano y percentiles 10/90 observados después de 6, 12 y 24 velas de 4H (24/48/96 horas).
- Frecuencia histórica de alcanzar primero la resistencia o la invalidación dentro de las 24 velas posteriores, relativa al ATR y **partiendo del precio actual**, no de las entradas E1/E2/E3.
- Número de casos comparables y circunstancias de comparación.

Limitaciones: son muestras **solapadas**, no independientes, y el modelo no está validado fuera de muestra. No son probabilidades calibradas de ganancias ni de ejecución; no deben usarse para dimensionar operaciones, ni como promesa de dirección futura. La proyección cuantitativa es distinta de los caminos estructurales condicionales ilustrados en el gráfico.

## Señales bloqueadas por régimen de mercado (v0.5.1)

Si las velas cerradas 4H no confirman tendencia alcista + momentum positivo creciente + filtro ADX (cuando está activado), el modelo **no construye órdenes Long** ni niveles E1/E2/E3 como compras. En esos casos el gráfico conserva el estudio prospectivo de soportes, resistencias y rangos históricos como observación de mercado. Distingue mercado bajista (DI− dominante y momentum negativo) de rango/no confirmación. El panel advierte **NO COMPRAR**.

Los niveles no se transforman en compras solo por caer a un soporte. El nuevo Long necesita un disparador Carter 4H auténtico (Squeeze ON → OFF, EMA alineadas, momentum positivo creciente y ADX/DI si habilitado), TP en resistencia observable y riesgo justificado. En mercados bajistas, la comparación cuantitativa de hit-rate utiliza resistencia contra soporte (no TP/SL de una compra no existente).

Las verificaciones de conectividad de SOLUSDT y BTCUSDT se realizaron en navegador sobre la versión anterior v0.5 (Binance REST funcional). La corrección v0.5.1 se validó con pruebas automáticas y despliegue READY, pero su ejecución en navegador no fue repetida desde este entorno.

## Cómo funciona

- Gráfico Binance Spot 4H, con señal confirmada exclusivamente al cerrar la vela.
- Carter: TTM Squeeze BB 20/2 y KC 20/1.5, momentum por regresión 20, tendencia EMA 10/55/200. Filtro ADX Wilder 14 y +DI/-DI configurable.
- Perfil de volumen: POC, VAH, VAL (70% de área de valor) y nodos HVN, calculado **por defecto exclusivamente sobre las velas 4H** durante 14, 30, 60 o 90 días. Opcionalmente puede seleccionarse fuente 1H como mayor detalle intrabar, sin afectar indicadores, señales ni plan 4H.
- E1: señal Carter vigente (máximo 10 minutos después de apertura y desvío menor a 0,25 ATR) o una futura zona de soporte, que requiere reconfirmación.
- E2/E3: soportes separados en el gráfico. Son niveles CONDICIONADOS a una confirmación alcista nueva en 4H, nunca órdenes automáticas por una caída.
- TP: primera resistencia técnica existente que permita R/R al menos 1,5:1 desde E1, medida desde el stop. Si no existe, se informa SIN TP VÁLIDO.
- SL: nivel de invalidación por debajo del último soporte, con colchón de 0,45 ATR.
- Promedio hipotético: pesos por unidades 40/35/25, normalizados si solo se detectan 1 o 2 soportes; capital y riesgo editables, sin apalancamiento.

## Limitaciones del perfil

Los OHLCV de Binance no contienen el volumen negociado exacto por precio. El perfil reparte el volumen de cada vela fuente (4H por defecto, 1H opcional) dentro del rango máximo-mínimo de forma uniforme. Esto es una ESTIMACIÓN de volumen por precio, no un footprint, libro de órdenes ni un perfil real de transacciones. Si falla la fuente opcional 1H se vuelve a 4H y se avisa. El volumen de 4H ofrece menor detalle interno; esto no altera el marco temporal de operación.

## Confirmación, ejecución y pruebas

- ENTRAR LONG exige señal completa, precio fresco, ventana de entrada y TP válido.
- ESPERAR significa que un soporte posible aún no confirma una compra.
- NO ENTRAR significa que no existe disparador actual o no se justifica el riesgo.
- La app no envía órdenes ni guarda credenciales.
- GitHub Actions valida sintaxis y operaciones matemáticas del motor con datos sintéticos.
- Vercel informa producción READY y la página se puede abrir.
- No se completó una prueba integral con cotizaciones de Binance desde un navegador real del usuario.
- El modelo E1/E2/E3 + TP estructural es NUEVO: todavía NO fue contrastado con backtesting fuera de muestra y no debe confundirse con la variante Carter 4H previamente simulada en Python.

