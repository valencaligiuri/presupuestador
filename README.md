# Presupuestador

Aplicación local para importar un catálogo, preparar presupuestos y exportarlos en una versión para el cliente o una hoja interna confidencial.

## Desarrollo

```sh
npm install
npm run dev
```

Validaciones:

```sh
npm test
npm run build
```

## Catálogo

Importá archivos `.xlsx`, `.xls` o `.csv`. La primera hoja debe tener una fila de encabezados. `Nombre` y `Precio` son obligatorios; `Marca`, `Modelo`, `Categoría` y `Código/SKU` se usan para identificar y filtrar productos.

| Nombre | Marca | Modelo | Precio | Categoría | Código/SKU |
|---|---|---|---:|---|---|
| Taladro percutor 750 W | Bosch | GSB 16 RE | 184500 | Herramientas | BOS-016 |

El precio del catálogo se interpreta como costo base, en pesos argentinos, sin símbolo de moneda. Se puede descargar una plantilla CSV desde la aplicación.

## Cálculos y exportación

- El margen global inicial es 30% sobre el costo base y se puede ajustar por presupuesto.
- Cada adicional se clasifica como costo interno o importe a trasladar al cliente. Los porcentajes pueden calcularse sobre productos, el total acumulado de su categoría o un producto específico.
- Los costos internos se descuentan del margen para estimar la ganancia neta. Los impuestos predeterminados son comerciales y aparecen en ambas versiones.
- **PDF cliente** incluye los precios unitarios con el margen incorporado y solo los adicionales comerciales; no muestra costos ni el desglose de margen.
- **PDF interno** incluye costos base, margen, adicionales internos y comerciales, total al cliente y ganancia neta estimada.

Los presupuestos y catálogos se guardan en `localStorage` del navegador. La aplicación no necesita una cuenta ni un servidor.

## Publicación

El workflow de GitHub Actions publica automáticamente `main` en GitHub Pages: <https://valencaligiuri.github.io/presupuestador/>.
