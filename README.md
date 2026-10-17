# Sagrario Asistencias

Aplicación de escritorio en Electron para Windows, con diseño azul marino y guardado local.

- Búsqueda exacta por número, o por nombre del confirmando o padrino (sin distinguir acentos).
- Palomitas independientes de asistencia para confirmando y padrino.
- Corrección de nombres, padrinos, observaciones permanentes y notas por día.
- Calendario: crear una fecha o todos los días de un año, sin sobrescribir listas existentes.
- Exportación completa de una fecha a PDF horizontal o CSV compatible con Excel.
- Respaldo y restauración de todas las listas; copia automática anterior a cada restauración.
- Instalador NSIS y actualizaciones desde GitHub Releases.

## Uso

Abre la app, elige la fecha y escribe el número en el buscador. Marca cada asistencia. Pulsa el nombre o el lápiz para editar los datos y notas, y después **Guardar cambios**. La búsqueda por número es exacta: `12` no devuelve `112`.

En **Listas y calendario**, crea un día o un año completo. Selecciona la lista de la que deseas copiar los nombres. Las nuevas fechas copian personas y observaciones del registro; comienzan sin asistencias y sin notas del día. Las correcciones se aplican solamente a la lista abierta y a nuevas listas que se creen copiándola. Las listas que ya existen conservan su información histórica.

En **Ajustes y respaldos** puedes guardar y restaurar copias, abrir la carpeta de datos y buscar actualizaciones. La descarga y el reinicio para actualizar se confirman con botones dentro de la app. El programa funciona sin conexión; internet sólo es necesario para las actualizaciones.

Los datos se guardan bajo `%APPDATA%/sagrario-asistencias/lists`, fuera de la instalación, con escritura atómica y copia `.bak` del estado anterior. Desinstalar o actualizar conserva estos datos. Un respaldo externo periódico protege ante pérdida de la computadora.

## Desarrollo

Requiere Node.js 24 y pnpm 11.

```sh
pnpm install
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm test:desktop
pnpm dist
```

El instalador se genera en `release/`. Los certificados de firma de Windows no están configurados; Windows puede mostrar SmartScreen al ejecutar el instalador.

## Datos iniciales y privacidad

El repositorio y las publicaciones públicas **no incluyen nombres, asistencias ni el PDF original**. `data/seed.json` está excluido de Git. Una compilación local puede incluir este archivo para iniciar la primera lista, únicamente si aún no existen datos. Una actualización nunca lo vuelve a importar ni reemplaza las listas existentes.

El importador local `scripts/import-pdf.py` extrae las tablas del documento de catequesis del 18 de octubre de 2026, verifica 265 números consecutivos y conserva sus observaciones. Las marcas ambiguas del documento se guardan como notas de revisión, sin convertirlas automáticamente en asistencia. Requiere Python y pdfplumber.

Sin el archivo local, la app inicia con una lista vacía; se puede agregar personas o restaurar un respaldo. **No publiques un instalador local que incluya el archivo de datos personales.** El flujo de GitHub impide publicar si encuentra ese archivo.

## Publicar actualizaciones

El repositorio configurado es `sistemascalc/sagrario-asistencias`. Aumenta `version` en `package.json`, sube los cambios y una etiqueta con la misma versión, por ejemplo `v1.0.1`. El flujo de GitHub Actions prueba el programa y publica el instalador, su `.blockmap` y `latest.yml` en GitHub Releases. La app instalada consulta estos archivos mediante electron-updater. No incluyas tokens de GitHub dentro de la app.

Referencias técnicas: [seguridad en Electron](https://www.electronjs.org/docs/latest/tutorial/security) y [actualizaciones con electron-builder](https://www.electron.build/v26/docs/features/auto-update/).
