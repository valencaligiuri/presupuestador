import { describe, expect, it } from 'vitest'
import type { AdditionalCharge, Product, QuoteItem } from '../types'
import { calculateCharges, calculateProductSubtotal } from './calculations'

const products: Product[] = [
  { id: 'a', name: 'Producto A', brand: '', model: '', price: 100, category: '', sku: '' },
  { id: 'b', name: 'Producto B', brand: '', model: '', price: 50, category: '', sku: '' },
]

describe('presupuesto y adicionales', () => {
  it('calcula costos, margen y acumulados internos y comerciales por separado', () => {
    const items: QuoteItem[] = [{ productId: 'a', quantity: 2 }]
    const charges: AdditionalCharge[] = [
      { id: 'ship', name: 'Envío', type: 'fixed', value: 10, base: 'products', productId: '', audience: 'commercial' },
      { id: 'tax', name: 'IVA', type: 'percent', value: 10, base: 'accumulated', productId: '', audience: 'commercial' },
      { id: 'pack', name: 'Embalaje', type: 'fixed', value: 20, base: 'products', productId: '', audience: 'internal' },
      { id: 'overhead', name: 'Gastos internos', type: 'percent', value: 10, base: 'accumulated', productId: '', audience: 'internal' },
    ]

    expect(calculateProductSubtotal(items, products)).toBe(200)
    expect(calculateCharges(items, charges, products, 30).map(({ baseAmount, amount }) => [baseAmount, amount])).toEqual([
      [260, 10],
      [270, 27],
      [200, 20],
      [220, 22],
    ])
  })

  it('aplica porcentajes comerciales al precio de venta del producto elegido', () => {
    const items: QuoteItem[] = [
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
    ]
    const charge: AdditionalCharge = {
      id: 'fee',
      name: 'Cargo',
      type: 'percent',
      value: 10,
      base: 'product',
      productId: 'a',
      audience: 'commercial',
    }

    expect(calculateCharges(items, [charge], products, 30)[0]).toMatchObject({
      baseAmount: 260,
      amount: 26,
    })
  })
})
