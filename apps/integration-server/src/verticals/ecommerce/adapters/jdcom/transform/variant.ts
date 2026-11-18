/**
 * JD.com SKU attributes → canonical ProductVariant.
 *
 * JD's "sale attributes" are what other platforms call variants. Each
 * ware (commodity) can have multiple SKUs with different sale attribute
 * combinations (e.g. color x size). The `jingdong.sku.attrs.read` API
 * returns the attribute definitions for a given ware.
 *
 * For JD, each SKU is already a variant, so we build ProductVariant
 * directly from SKU data with sale attribute info.
 */

import type { ProductVariant } from '../../../schema/product'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawJdSaleAttrValue {
  attr_value_id?: number
  attr_value_name?: string
  [key: string]: unknown
}

export interface RawJdSaleAttr {
  attr_id?: number
  attr_name?: string
  attr_values?: RawJdSaleAttrValue[]
  [key: string]: unknown
}

export interface RawJdVariantSku {
  sku_id: number
  ware_id?: number
  outer_id?: string
  upc_code?: string
  jd_price?: number
  market_price?: number
  title?: string
  sale_attrs?: Array<{
    attr_name?: string
    attr_value?: string
    [key: string]: unknown
  }>
  stock_num?: number
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build option values from sale attributes on a SKU.
 */
function buildOptionValues(
  saleAttrs: Array<{ attr_name?: string; attr_value?: string }> | undefined,
): Record<string, string> | undefined {
  if (!saleAttrs || saleAttrs.length === 0) return undefined
  const result: Record<string, string> = {}
  for (const attr of saleAttrs) {
    if (attr.attr_name && attr.attr_value) {
      result[attr.attr_name] = attr.attr_value
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function transformVariant(raw: RawJdVariantSku): ProductVariant {
  const currency = 'CNY'
  const optionValues = buildOptionValues(raw.sale_attrs)
  const title = optionValues
    ? Object.values(optionValues).join(' / ')
    : raw.title ?? `SKU ${raw.sku_id}`

  return {
    id: String(raw.sku_id),
    productId: raw.ware_id != null ? String(raw.ware_id) : undefined,
    sku: raw.outer_id,
    barcode: raw.upc_code,
    title,
    price: {
      amount: raw.jd_price ?? 0,
      currency,
    },
    compareAtPrice:
      raw.market_price != null &&
      raw.jd_price != null &&
      raw.market_price > raw.jd_price
        ? { amount: raw.market_price, currency }
        : undefined,
    optionValues,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformVariants(skus: RawJdVariantSku[]): ProductVariant[] {
  return skus.map(transformVariant)
}
