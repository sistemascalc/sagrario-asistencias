# Sagrario Asistencias

Aplicación de escritorio en Electron para Windows, con diseño azul marino y guardado local.

- Búsqueda exacta por número, o por nombre del confirmando o padrino (sin distinguir acentos).
- Palomitas independientes de asistencia para confirmando y padrino.
- Corrección de nombres, padrinos, observaciones permanentes y notas por día.
- Calendario: crear una fecha o todos los días de un año, sin sobrescribir listas existentes.
- Importación local de Excel (.xlsx, .xls) y CSV con selección de hoja, columnas y vista previa.
- Combinación de dos fechas con los confirmandos que asistieron a cualquiera de ellas, ordenados por apellido.
- Orden manual con flechas o posición exacta, conservando números, asistencias y el orden de exportación.
- Exportación completa de una fecha a PDF horizontal o CSV compatible con Excel.
- Respaldo y restauración de todas las listas; copia automática anterior a cada restauración.
- Instalador NSIS y actualizaciones desde GitHub Releases.

## Uso

Abre la app, elige la fecha y escribe el número en el buscador. Marca cada asistencia. Pulsa el nombre o el lápiz para editar los datos y notas, y después **Guardar cambios**. La búsqueda por número es exacta: `12` no devuelve `112`.

En **Listas y calendario**, crea un día o un año completo. Selecciona la lista de la que deseas copiar los nombres. Las nuevas fechas copian personas y observaciones del registro; comienzan sin asistencias y sin notas del día. Las correcciones se aplican solamente a la lista abierta y a nuevas listas que se creen copiándola. Las listas que ya existen conservan su información histórica.

En **Ajustes y respaldos** puedes guardar y restaurar copias, abrir la carpeta de datos y buscar actualizaciones. La descarga y el reinicio para actualizar se confirman con botones dentro de la app. El programa funciona sin conexión; internet sólo es necesario para las actualizaciones.

### Importar una lista de Excel

1. Pulsa **Importar Excel** en Asistencia o Listas y calendario y elige el archivo.
2. Selecciona la fecha, el nombre de la lista, la hoja y la fila que contiene los títulos de las columnas. La app reconoce encabezados comunes, aunque puedes corregir la selección.
3. Relaciona las columnas: número, nombre, apellidos, padrino y observaciones. Puedes utilizar un nombre completo en una sola columna. Si no hay números, activa **Asignar números automáticamente desde el 1**.
4. Revisa la vista previa y pulsa **Importar lista**. Los nombres son obligatorios; los demás textos son opcionales. Los números deben ser únicos, enteros y estar entre 1 y 999999. Las filas completamente vacías se omiten.

La importación crea una lista nueva; una fecha existente no se reemplaza. Las asistencias y notas del día empiezan vacías. Las observaciones del archivo se guardan como observaciones del registro. La app valida todas las filas, aunque muestra solamente ocho en la vista previa. Si encuentra errores, corrige las columnas o vuelve a elegir el archivo corregido: no guarda una lista parcial.

Se admiten archivos de hasta 10 MB, 20 hojas, 100 columnas por hoja y 10,000 personas por lista; la fila de encabezados puede estar entre las primeras 200 filas. Los archivos protegidos por contraseña no se admiten. Las fórmulas en las columnas seleccionadas deben pegarse como valores antes de importar. Todo se procesa en esta computadora; el archivo no se sube a GitHub ni a otro servidor.

### Combinar asistentes de dos listas

Pulsa **Combinar dos listas**, disponible en Asistencia y Listas y calendario. Selecciona dos fechas diferentes, la fecha de la nueva lista y su nombre. La vista previa incluye solamente a los confirmandos con su asistencia marcada en al menos una de las dos fechas; la asistencia del padrino por sí sola no incluye al confirmando. Cada integrante conserva a su padrino y sus observaciones. Las palomitas y notas del nuevo día comienzan en blanco.

Cuando el mismo número y nombre aparecen en ambas fechas, se incluye una sola persona con los datos de la asistencia más reciente. Si un número corresponde a nombres distintos, elige el registro de una de las listas o conserva ambos: en este último caso se asigna un número libre al segundo registro solamente en la lista nueva. Los nombres iguales con números distintos se conservan separados y se muestran para revisión. La app no sobrescribe fechas existentes, no modifica las listas originales y pide revisar de nuevo si sus datos cambiaron desde la vista previa.

El orden inicial es por apellido paterno, apellido materno y nombre, con ordenación en español. Los registros sin apellidos separados quedan al final por nombre. Para ordenarlos por apellido, completa sus campos de apellidos mediante **Editar** y usa **A–Z por apellido**.

### Mover personas y guardar el orden

Abre una fecha y pulsa **Ordenar y mover**. Usa las flechas para subir o bajar integrantes, o selecciona a una persona e indica su nueva posición en la lista completa. Puedes buscar por número o nombre. **A–Z por apellido** vuelve a ordenar toda la lista y **Guardar orden** conserva los cambios. Cancelar deja el orden anterior intacto.

Cambiar la posición no cambia el número de registro, las asistencias ni las notas. El orden se conserva después de editar, cerrar la app, crear listas que copien esa fecha, respaldar y restaurar; también se utiliza al exportar a PDF o CSV. Los nuevos integrantes agregados manualmente se colocan al final.

Los datos se guardan bajo `%APPDATA%/sagrario-asistencias/lists`, fuera de la instalación, con escritura atómica y copia `.bak` del estado anterior. Desinstalar o actualizar conserva estos datos. Un respaldo externo periódico protege ante pérdida de la computadora.

## Desarrollo

Requiere Node.js 24 y pnpm 11.

```sh
pnpm install
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm test:desktop
pnpm test:import
pnpm test:combine
pnpm dist
```

El instalador se genera en `release/`. Los certificados de firma de Windows no están configurados; Windows puede mostrar SmartScreen al ejecutar el instalador.

## Datos iniciales y privacidad

El repositorio y las publicaciones públicas **no incluyen nombres, asistencias ni el PDF original**. `data/seed.json` está excluido de Git. Una compilación local puede incluir este archivo para iniciar la primera lista, únicamente si aún no existen datos. Una actualización nunca lo vuelve a importar ni reemplaza las listas existentes.

El importador local `scripts/import-pdf.py` extrae las tablas del documento de catequesis del 18 de octubre de 2026, verifica 265 números consecutivos y conserva sus observaciones. Las marcas ambiguas del documento se guardan como notas de revisión, sin convertirlas automáticamente en asistencia. Requiere Python y pdfplumber.

Sin el archivo local, la app inicia con una lista vacía; se puede importar Excel, agregar personas o restaurar un respaldo. **No publiques un instalador local que incluya el archivo de datos personales.** El flujo de GitHub impide publicar si encuentra ese archivo.

## Publicar actualizaciones

El repositorio configurado es `sistemascalc/sagrario-asistencias`. Aumenta `version` en `package.json`, sube los cambios y una etiqueta con la misma versión, por ejemplo `v1.0.1`. El flujo de GitHub Actions prueba el programa y publica el instalador, su `.blockmap` y `latest.yml` en GitHub Releases. La app instalada consulta estos archivos mediante electron-updater. No incluyas tokens de GitHub dentro de la app.

Referencias técnicas: [seguridad en Electron](https://www.electronjs.org/docs/latest/tutorial/security), [actualizaciones con electron-builder](https://www.electron.build/v26/docs/features/auto-update/) y [distribución oficial de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
