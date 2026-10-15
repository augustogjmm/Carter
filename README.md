# Carter 4H · Analizer operativo v0.4

Aplicación estática: https://carter-rust.vercel.app . Conectada al repositorio y desplegada automáticamente por Vercel desde la rama main.

## Qué se proyecta (siempre 4H)

El panel principal muestra escenarios futuros condicionados por la estructura: retroceso a E1, continuación sin retroceso e invalidación. La zona sombreada a la derecha de las últimas velas representa las posibles secuencias de niveles, **sin plazos estimados ni probabilidades**. Cada compra exige confirmación 4H posterior: un toque del soporte no ejecuta ni autoriza una compra. No se generan precios futuros inventados: los puntos corresponden a precio actual, soportes, resistencias y stop calculados.

Se comparan las operaciones hipotéticas con E1, E1+E2 y E1+E2+E3: promedio, exposición, resultado al TP y al SL descontando una comisión aproximada total de 0,20%. El TP debe estar en la **primera resistencia relevante**, no se salta una resistencia próxima para simular mejor beneficio/riesgo. Si el primer obstáculo no ofrece R/R suficiente, se descarta la entrada.

Estos escenarios sirven para **preparar decisiones**, no predicen qué dirección tomará el mercado. Sin backtest específico no hay una tasa de éxito válida para el modelo escalonado.

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
