import * as XLSX from 'xlsx'
import type { Product } from '../types'

export interface CatalogImportResult {
  products: Product[]
  errors: string[]
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function readPrice(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return undefined

  const normalized =
    text.includes(',') && text.includes('.')
      ? text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '')
      : text.includes(',')
        ? text.replace(',', '.')
        : text
  const price = Number(normalized)
  return Number.isFinite(price) ? price : undefined
}

export async function importCatalog(file: File): Promise<CatalogImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) {
    return { products: [], errors: ['El archivo no contiene hojas con datos.'] }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: '',
    raw: true,
  })
  if (rows.length === 0) {
    return { products: [], errors: ['No se encontraron filas de productos.'] }
  }

  const headers = new Map(
    Object.keys(rows[0]).map((header) => [normalizeHeader(header), header]),
  )
  const nameColumn = headers.get('nombre')
  const priceColumn = headers.get('precio')
  if (!nameColumn || !priceColumn) {
    return {
      products: [],
      errors: ['Faltan columnas obligatorias: Nombre y Precio.'],
    }
  }

  const optionalColumns = {
    brand: headers.get('marca'),
    model: headers.get('modelo'),
    category: headers.get('categoria'),
    sku: headers.get('codigosku') ?? headers.get('codigo'),
  }
  const products: Product[] = []
  const errors: string[] = []

  rows.forEach((row, index) => {
    const name = String(row[nameColumn] ?? '').trim()
    const price = readPrice(row[priceColumn])
    if (!name || price === undefined || price < 0) {
      errors.push(`Fila ${index + 2}: nombre o precio inválido.`)
      return
    }

    products.push({
      id: `${file.name}-${index}-${name}`,
      name,
      price,
      brand: String(optionalColumns.brand ? row[optionalColumns.brand] : '').trim(),
      model: String(optionalColumns.model ? row[optionalColumns.model] : '').trim(),
      category: String(
        optionalColumns.category ? row[optionalColumns.category] : '',
      ).trim(),
      sku: String(optionalColumns.sku ? row[optionalColumns.sku] : '').trim(),
    })
  })

  return { products, errors }
}
