export interface Product {
  id: string
  name: string
  brand: string
  model: string
  price: number
  category: string
  sku: string
}

export interface QuoteItem {
  productId: string
  quantity: number
}

export type ChargeType = 'fixed' | 'percent'
export type ChargeBase = 'products' | 'accumulated' | 'product'
export type ChargeAudience = 'internal' | 'commercial'

export interface AdditionalCharge {
  id: string
  name: string
  type: ChargeType
  value: number
  base: ChargeBase
  productId: string
  audience: ChargeAudience
}

export interface ClientDetails {
  name: string
  taxId: string
  email: string
  phone: string
  address: string
}
