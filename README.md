# Carter 4H · Analizer operativo v0.3

Aplicación estática: https://carter-rust.vercel.app . Conectada al repositorio y desplegada automáticamente por Vercel desde la rama main.

## Cómo funciona

- Gráfico Binance Spot 4H, con señal confirmada exclusivamente al cerrar la vela.
- Carter: TTM Squeeze BB 20/2 y KC 20/1.5, momentum por regresión 20, tendencia EMA 10/55/200. Filtro ADX Wilder 14 y +DI/-DI configurable.
- Perfil de volumen: POC, VAH, VAL (70% de área de valor) y nodos HVN, calculado sobre velas 1H durante 14, 30, 60 o 90 días.
- E1: señal Carter vigente (máximo 10 minutos después de apertura y desvío menor a 0,25 ATR) o una futura zona de soporte, que requiere reconfirmación.
- E2/E3: soportes separados en el gráfico. Son niveles CONDICIONADOS a una confirmación alcista nueva en 4H, nunca órdenes automáticas por una caída.
- TP: primera resistencia técnica existente que permita R/R al menos 1,5:1 desde E1, medida desde el stop. Si no existe, se informa SIN TP VÁLIDO.
- SL: nivel de invalidación por debajo del último soporte, con colchón de 0,45 ATR.
- Promedio hipotético: pesos por unidades 40/35/25, normalizados si solo se detectan 1 o 2 soportes; capital y riesgo editables, sin apalancamiento.

## Limitaciones del perfil

Los OHLCV de Binance no contienen el volumen negociado exacto por precio. El perfil reparte el volumen de cada vela 1H dentro del rango máximo-mínimo de forma uniforme. Esto es una ESTIMACIÓN de volumen por precio, no un footprint, libro de órdenes ni un perfil real de transacciones. Si falla la fuente 1H se usa un perfil degradado de velas 4H y se avisa.

## Confirmación, ejecución y pruebas

- ENTRAR LONG exige señal completa, precio fresco, ventana de entrada y TP válido.
- ESPERAR significa que un soporte posible aún no confirma una compra.
- NO ENTRAR significa que no existe disparador actual o no se justifica el riesgo.
- La app no envía órdenes ni guarda credenciales.
- GitHub Actions valida sintaxis y operaciones matemáticas del motor con datos sintéticos.
- Vercel informa producción READY y la página se puede abrir.
- No se completó una prueba integral con cotizaciones de Binance desde un navegador real del usuario.
- El modelo E1/E2/E3 + TP estructural es NUEVO: todavía NO fue contrastado con backtesting fuera de muestra y no debe confundirse con la variante Carter 4H previamente simulada en Python.
