/**
 * Centralized product list for Kawman ExAct CRM.
 * 
 * This is the single source of truth for all product dropdowns across the application.
 * All product-related components should import from this file.
 */

export const STANDARD_PRODUCTS = [
  'CafRelExAct™',
  'AsparExAct™',
  'NacExAct™',
  'AlphaExAct™ 75%',
  'AlphaExAct™ 15% WS',
  'CarniExAct™',
  'ArginExAct™',
  'MetExAct™',
  'α-KetoExAct™',
  'BranChExAct RD™',
  'TelmiExAct™ DC 18.41%',
  'TelmiExAct™ DC 28.88%',
  'VitExAct™ B12 0.1% WS',
  'VitExAct™ B12 0.1% WD',
  'VitExAct™ B12 1% WD',
  'CoQExAct™ granules' ,
  'CoQExAct™ 10% Emulsion',
  'CoQExAct™ 20% Emulsion',
  'DHA ExAct™ CWD',
  'SoluExAct™ MCT CWS',
] as const

export const PRODUCT_OTHER_OPTION = 'Other'

export type StandardProduct = (typeof STANDARD_PRODUCTS)[number]

export function isStandardProduct(value: string): value is StandardProduct {
  return STANDARD_PRODUCTS.includes(value as StandardProduct)
}

export function getAllProductOptions(): string[] {
  return [...STANDARD_PRODUCTS, PRODUCT_OTHER_OPTION]
}

export function getProductOptionsForSelect(): { value: string; label: string }[] {
  return [
    ...STANDARD_PRODUCTS.map((product) => ({ value: product, label: product })),
    { value: PRODUCT_OTHER_OPTION, label: PRODUCT_OTHER_OPTION },
  ]
}

export const PRODUCT_CATEGORIES = [
  'Nutraceutical',
  'Cosmetic',
  'Food & Beverage',
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]