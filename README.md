# Hojas de wireframe

Herramienta de una sola página (HTML/CSS/JS vanilla) para generar hojas A4 en PDF con plantillas de dispositivos (móvil/escritorio) para bocetar pantallas a mano con lápiz.

## Uso local

No requiere build ni dependencias instaladas: es un único `index.html` que carga jsPDF desde CDN.

```bash
open index.html
```

O con un servidor local simple (recomendable para evitar restricciones de `file://` en algunos navegadores):

```bash
npx serve .
# o
python3 -m http.server 8080
```

## Qué hace

- Genera plantillas vectoriales de iPhone/navegador en A4, configurables desde un panel lateral.
- Controles: tipo de hoja (móvil/escritorio), nº de dispositivos por hoja, orientación, fondo (puntos/cuadrícula/columnas), color de línea (gris o azul no reproducible), chrome del dispositivo, etiquetas, cabecera con proyecto/fecha, nº de páginas.
- Exporta PDF (una hoja, o móvil+escritorio combinados) vía jsPDF.
- Previsualización en vivo como SVG en pantalla.

## Origen

Archivo descargado desde una conversación con Claude (`Hojas de wireframe.html`), movido aquí como punto de partida versionado en `~/Desktop/hojas-wireframe`.
