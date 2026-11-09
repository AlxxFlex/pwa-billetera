# Mi Billetera Lite

PWA local para registrar gastos diarios, consultar el historial y conocer el total en pesos mexicanos. Funciona sin conexión después de preparar la caché de la interfaz y guarda los gastos en IndexedDB, dentro del navegador.

## Probar en local

Requiere Node.js 22 o posterior. No necesita instalar dependencias.

```sh
npm run dev
```

Abre **http://localhost:4173** en Chrome o Edge. Mantén la terminal abierta mientras pruebas; pulsa `Ctrl+C` para detener el servidor.

Usa el servidor local en lugar de abrir `index.html` directamente. El service worker necesita un origen seguro, como `localhost`.

## Funcionalidad

- Registro de concepto, monto y categoría: Comida, Transporte, Servicios, Ocio u Otros.
- Historial desde el gasto más reciente, totalizador y distribución por categoría.
- Búsqueda, filtros, eliminación con confirmación y exportación CSV.
- Instalación como aplicación independiente en navegadores compatibles.

La app inicia sin gastos de ejemplo. Tus registros permanecen en este navegador y dispositivo; no se envían a un servidor ni se sincronizan. Borrar los datos del sitio o el perfil del navegador elimina el historial. Exporta un CSV si quieres conservar una copia.

## Comprobar el modo offline

1. Abre **http://localhost:4173** y espera a ver **Lista para usar sin conexión**.
2. En DevTools, selecciona **Network → Offline** y recarga normalmente. La interfaz debe seguir cargando con sus estilos y lógica.
3. Registra **Taxis**, monto **150**, categoría **Transporte**. Comprueba el historial y el aumento de **$150.00** en el total.
4. Cierra y vuelve a abrir la misma URL sin conexión. El gasto debe conservarse. Si usas DevTools, vuelve a activar Offline en la pestaña nueva.

Para revisar la PWA, consulta **Application → Manifest** y **Service Workers**. Para instalarla, utiliza **Instalar app** o la opción de instalación del navegador. No borres la caché durante la prueba offline.

## Verificar el proyecto

```sh
npm test
npm run build
```

Las pruebas comprueban validación, cálculo de montos y comportamiento del service worker. El build copia los archivos de la aplicación a `dist/`; no publica nada.

## Archivos principales

| Archivo | Función |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Interfaz y comportamiento. |
| `storage.js` | Validación y persistencia en IndexedDB. |
| `manifest.json` | Identidad de la PWA, modo `standalone` e iconos. |
| `sw.js` | Caché de la interfaz, limpieza de versiones y estrategia Cache First con respaldo de red. |
| `icons/` | Iconos de la aplicación. |
| `scripts/` | Servidor local, build y generación de iconos. |
| `tests/` | Pruebas automatizadas. |

Si cambias los archivos de la interfaz, incrementa la versión `CACHE_NAME` en `sw.js` para que el navegador prepare la actualización. La app permite aplicarla después de guardar un formulario pendiente.
