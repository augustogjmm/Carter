# Carter — Migración a Cloudflare Pages Free

La versión de Cloudflare se prepara sin cuentas de pago. **No es necesario crear Supabase, D1, KV, R2, un dominio comprado, ni añadir una tarjeta para la arquitectura propuesta.** El código de Carter y sus escáneres no se renombran.

## Estado de publicación

Los archivos necesarios ya están en este repositorio, pero la publicación requiere una sesión de Cloudflare autenticada y autorizar a Cloudflare a conectar este repositorio privado de GitHub. Sin esa conexión no se puede afirmar que la URL \`*.pages.dev\` esté en producción.

## Configuración del proyecto Cloudflare (una sola vez)

1. En **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**, seleccionar la cuenta **Free** y conectar el repositorio **augustogjmm/Carter**. Si ya existe un proyecto Pages conectado a este repositorio, **reutilizarlo** y actualizar su configuración de build en lugar de crear otro.
2. Nombre del proyecto si es nuevo: **carter** (Cloudflare asignará el dominio \`<nombre>.pages.dev\`, sujeto a disponibilidad).
3. **Production branch:** \`main\`. **Framework:** None. **Build command:** \`node scripts/build-cloudflare.cjs\`. **Build output directory:** \`cloudflare-dist\`. **Root directory:** raíz del repositorio.
4. **No introducir secretos, tarjetas ni activar planes de pago.** El build no requiere NPM ni dependencias externas, y las APIs usan proveedores públicos en modo lectura.
5. Guardar y desplegar **una sola vez**. Si hay conflicto con el nombre, usar el nombre libre que ofrezca la interfaz y conservar la marca Carter.
6. Verificar públicamente \`/api/health\`, \`/api/top50\`, \`/api/desk-quote?symbol=BTCUSDT\`, \`/api/market?path=%2Fapi%2Fv3%2Fklines&query=symbol%3DBTCUSDT%26interval%3D4h%26limit%3D1000\`, \`/desk.html\`, \`/trading-latino.html\`, \`/pcs.html\`.
7. **Solo cuando todo pase**, compartir la nueva URL. Vercel se mantiene como referencia histórica, pero no hace falta desplegar allí.

## Arquitectura 100 % en servicios gratuitos (dentro de las cuotas)

- **Pages Static:** HTML, JS, CSS, gráficos y datos públicos. Static requests gratuitas sin ancho de banda medido para facturación.
- **Pages Functions:** \`/api/market\`, \`/api/top50\`, \`/api/desk-quote\`, \`/api/health\` — sujetos al límite Workers Free de 100.000 llamadas diarias. No se envían órdenes.
- **GitHub Actions Free (sujeto al plan GitHub y minutos disponibles):** mantiene el radar y el registro público *paper* cada 4 horas. El push de JSON al repositorio dispara una compilación Pages. Normalmente 6 cambios de mercado por día ≈ 180 builds mensuales, por debajo de los 500 incluidos si no se generan cientos de compilaciones de desarrollo.
- **Sin Supabase:** la bitácora privada de compras/ventas sigue **local al navegador**. El usuario puede exportar e importar JSON; la sincronización multi-dispositivo y monitorización de tenencias personales con pestaña cerrada **NO están implementadas en Cloudflare**. Nunca publicar ni sincronizar el journal en \`data\`.

## Seguridad y fallos esperados

- El build copia **solo** archivos cliente y datos públicos. No publica el estado \`data/paper/state.json\`, secretos, repositorio \`.git\`, carpetas privadas ni módulos opcionales Supabase.
- El perfil de volumen OHLCV sigue siendo **estimado**, no volumen ejecutado por precio.
- Los Workers pueden devolver 503 si Binance/CoinGecko/KuCoin no responden desde Cloudflare. Los tickets deben bloquearse cuando no se puede verificar mercado, libro y filtros.
- Si se supera la cuota Workers Free, se interrumpe el API (no se habilita automáticamente un plan de pago). Si se superan las compilaciones gratuitas, hay que esperar el reinicio de cuota, no contratar.
- Los escaneos 4H y la publicación con un commit pueden quedar atrasados si falla GitHub Actions; los radares muestran fecha y no deben inventar entradas.
- El despliegue, la configuración de Cloudflare y el smoke test de la URL final se consideran **pendientes** hasta verificarse desde una cuenta vinculada.

## Pruebas de desarrollo

\`\`\`bash
node --test tests/cloudflare-pages.test.mjs
node scripts/build-cloudflare.cjs
\`\`\`

Cloudflare: documentación de [integración con Git](https://developers.cloudflare.com/pages/get-started/git-integration/), [límites gratuitos Pages](https://developers.cloudflare.com/pages/platform/limits/), [rutas de Pages Functions](https://developers.cloudflare.com/pages/functions/routing/), [Workers Free](https://developers.cloudflare.com/workers/platform/limits/).
