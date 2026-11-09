# Mi Billetera Lite

PWA para registrar gastos cotidianos, consultar el historial y conocer el total en pesos mexicanos. Interfaz adaptable a móvil y escritorio, con tipografía del sistema, colores neutros y recursos incluidos en el proyecto.

Publicación HTTPS preparada con Sites: **https://mi-billetera-lite-alxxflex.angelheriberto87.chatgpt.site**. El acceso de Sites es privado para la cuenta propietaria. El repositorio conserva su privacidad; GitHub Pages requiere un plan que admita este repositorio privado.

## Ejecutar localmente

Requiere Node.js 22 o posterior. No utiliza dependencias de ejecución ni servicios externos.

```sh
npm install
npm run dev
```

Abre **http://localhost:4173**. Usa este servidor en lugar de abrir `index.html` directamente: el service worker requiere HTTPS o un origen local seguro como `localhost`.

```sh
npm test
npm run build
```

El primer comando ejecuta las pruebas automatizadas disponibles. El segundo prepara `dist/` con los archivos estáticos para publicar. Las pruebas automatizadas no sustituyen la comprobación de instalación y modo offline en un navegador real.

## Funcionalidad

- Registro de concepto, monto y categoría: Comida, Transporte, Servicios, Ocio u Otros.
- Historial ordenado desde el registro más reciente y total calculado en centavos para evitar errores de punto flotante.
- Almacenamiento local en IndexedDB y funcionamiento sin conexión después de la primera carga completa.
- Instalación como aplicación independiente en navegadores compatibles.
- Búsqueda y filtros por categoría, distribución de gastos, eliminación con confirmación y exportación CSV.

La aplicación inicia sin gastos de ejemplo. Los registros pertenecen al navegador y al origen donde se guardaron; los datos de `localhost` y los de la versión publicada son independientes. No se envían a un servidor ni se sincronizan entre dispositivos. Borrar los datos del sitio o el perfil del navegador elimina el historial. El modo privado puede limitar la persistencia.

## Arquitectura PWA

| Archivo | Función |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Interfaz y comportamiento de la aplicación. |
| `storage.js` | Validación y operaciones de gastos en IndexedDB. |
| `manifest.json` | Nombre, colores, inicio, alcance, modo `standalone` e iconos. |
| `sw.js` | Instalación del App Shell, limpieza de cachés antiguas y estrategia Cache First con respaldo de red. |
| `icons/` | Iconos PNG de 192 × 192 y 512 × 512 aptos para máscara, icono de Apple y favicon. |
| `.github/workflows/deploy.yml` | Pruebas, preparación de archivos y publicación en GitHub Pages. |

El service worker guarda la interfaz completa durante la instalación. Después sirve los recursos del App Shell desde caché y utiliza la red si falta un recurso. Una nueva versión elimina las cachés antiguas al activarse. Las rutas relativas permiten publicar en una subcarpeta como `/pwa-billetera/`.

La primera visita necesita conexión: espera a que la aplicación indique que está lista para usarse offline antes de desconectarte. El almacenamiento de gastos es independiente de la caché de la interfaz.

## Instalar

1. Abre el sitio mediante HTTPS o `localhost` en Chrome o Edge y espera a que termine de cargar.
2. Utiliza el botón de instalación si el navegador lo habilita, el icono en la barra de direcciones o la opción **Instalar aplicación** en el menú del navegador.
3. Abre la aplicación instalada y comprueba que aparece en una ventana independiente.

El navegador decide cuándo ofrece su aviso automático. En iPhone/iPad, abre el sitio en Safari y utiliza **Compartir → Agregar a inicio**. La disponibilidad y el texto de las opciones dependen del navegador y del sistema.

## Comprobar los criterios de aceptación

1. **Manifest y service worker:** en Chrome DevTools, abre **Application → Manifest** y comprueba los campos e iconos; en **Service Workers**, comprueba que el registro esté activado y controle la página. No marques *Bypass for network*.
2. **Instalación:** instala desde Chrome y abre la aplicación instalada; debe funcionar sin barra de direcciones en modo `standalone`.
3. **Supervivencia offline:** después de la primera carga, cambia **Network → Offline** y recarga normalmente. Deben aparecer la interfaz, los estilos y la lógica sin errores de red que bloqueen la app. No uses *Empty cache and hard reload*, porque vacía recursos que necesitas conservar para esta prueba.
4. **Registro sin red:** estando offline, registra **Taxis**, monto **150**, categoría **Transporte**. Comprueba que aparece primero en el historial y que el total aumenta en **$150.00**.
5. **Persistencia:** cierra la pestaña y vuelve a abrir la misma URL manteniendo el entorno offline. El gasto y el total deben conservarse. En DevTools, el modo offline se aplica al objetivo inspeccionado; mantenlo activado también al abrir una pestaña nueva o desconecta la red del dispositivo.
6. **Responsividad:** prueba un teléfono y escritorio; verifica navegación con teclado, etiquetas de los campos y mensajes de validación.

### Sobre Lighthouse

Chrome retiró la categoría **PWA** de Lighthouse; en las versiones actuales no corresponde esperar el antiguo badge verde. La validación de la PWA se realiza con **Application → Manifest**, **Service Workers**, instalación y las pruebas offline anteriores. Lighthouse sigue siendo útil para rendimiento, accesibilidad y buenas prácticas. Véase la [explicación oficial de Chrome](https://developer.chrome.com/blog/update-install-criteria).

## Publicar gratis con HTTPS

El repositorio está preparado para GitHub Pages mediante GitHub Actions:

1. Sube el código a la rama `main` de [AlxxFlex/pwa-billetera](https://github.com/AlxxFlex/pwa-billetera).
2. En GitHub, abre **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**. El plan de GitHub debe admitir Pages para el repositorio: el plan actual no lo permite mientras este repositorio sea privado.
3. En **Settings → Secrets and variables → Actions → Variables**, crea la variable de repositorio `ENABLE_PAGES` con el valor `true`. Después, en **Actions**, ejecuta **Publicar Mi Billetera Lite** con **Run workflow**, o envía un nuevo commit a `main`. Sin esa variable el flujo solo verifica pruebas y build, sin intentar un despliegue no disponible.
4. Espera a que terminen los trabajos de verificación y despliegue. La URL definitiva aparece en el entorno `github-pages` y en **Settings → Pages**.

La dirección esperada para este repositorio es **https://alxxflex.github.io/pwa-billetera/**. Solo estará disponible después de activar Pages y completar el despliegue; esta dirección por sí sola no confirma que el sitio esté publicado. Comprueba también **Enforce HTTPS** en la configuración de Pages.

Para otra plataforma de alojamiento estático, publica el contenido de `dist/` mediante HTTPS. No se necesitan claves ni variables de entorno. Después de publicar, repite la prueba de instalación y offline en ese origen.

Para publicar cambios del App Shell, incrementa la versión `CACHE_NAME` de `sw.js`. La app avisa cuando hay una versión nueva y permite aplicarla después de guardar el formulario, sin interrumpir un borrador en otra pestaña.

El workflow sigue el procedimiento de la [documentación oficial de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Para publicar en una subcarpeta, mantén `manifest.json`, `sw.js` y el resto de la aplicación en el mismo directorio.
