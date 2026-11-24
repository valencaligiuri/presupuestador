import type { AdditionalCharge, Product, QuoteItem } from '../types'

export interface CalculatedCharge {
  charge: AdditionalCharge
  baseAmount: number
  amount: number
}

export function calculateProductSubtotal(
  items: QuoteItem[],
  products: Product[],
): number {
  const prices = new Map(products.map((product) => [product.id, product.price]))
  return items.reduce(
    (total, item) => total + (prices.get(item.productId) ?? 0) * item.quantity,
    0,
  )
}

export function calculateCharges(
  items: QuoteItem[],
  charges: AdditionalCharge[],
  products: Product[],
  marginPercent: number,
): CalculatedCharge[] {
  const costSubtotal = calculateProductSubtotal(items, products)
  const saleSubtotal = costSubtotal * (1 + marginPercent / 100)
  let internalAccumulated = costSubtotal
  let commercialAccumulated = saleSubtotal

  return charges.map((charge) => {
    const item = items.find((quoteItem) => quoteItem.productId === charge.productId)
    const product = products.find((entry) => entry.id === charge.productId)
    const isInternal = charge.audience === 'internal'
    const baseAmount =
      charge.base === 'accumulated'
        ? isInternal
          ? internalAccumulated
          : commercialAccumulated
        : charge.base === 'product'
          ? item && product
            ? item.quantity *
              product.price *
              (isInternal ? 1 : 1 + marginPercent / 100)
            : 0
          : isInternal
            ? costSubtotal
            : saleSubtotal
    const amount =
      charge.type === 'percent' ? (baseAmount * charge.value) / 100 : charge.value

    if (isInternal) internalAccumulated += amount
    else commercialAccumulated += amount
    return { charge, baseAmount, amount }
  })
}
