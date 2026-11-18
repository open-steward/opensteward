/**
 * SAP Commerce Cloud variant → canonical ProductVariant.
 *
 * In SAP Commerce, variants are separate products linked to a base
 * product. Each variant product has its own code, price, stock, and
 * variant-specific attributes exposed via `variantOptionQualifiers`
 * on the parent or through `baseOptions` on the variant itself.
 *
 * The OCC API returns variant products in the same ProductWsDTO
 * structure as base products.
 */

import type { ProductVariant } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'
import type { RawSapProduct, RawSapVariantOption } from './product'

export function transformVariantFromProduct(
  raw: RawSapProduct,
  parentCode?: string,
  position?: number,
): ProductVariant {
  return {
    id: raw.code,
    productId: parentCode ?? raw.baseProduct ?? raw.code,
    sku: raw.code,
    title: raw.name ?? raw.code,
    price: {
      amount: majorToMinor(raw.price?.value ?? 0, raw.price?.currencyIso ?? 'USD'),
      currency: raw.price?.currencyIso ?? 'USD',
    },
    position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformVariantFromOption(
  vo: RawSapVariantOption,
  parentCode: string,
  position?: number,
): ProductVariant {
  const optionValues: Record<string, string> = {}
  for (const q of vo.variantOptionQualifiers ?? []) {
    if (q.qualifier && q.value) {
      optionValues[q.qualifier] = q.value
    }
  }
  return {
    id: vo.code ?? '',
    productId: parentCode,
    sku: vo.code,
    title: vo.code,
    price: {
      amount: majorToMinor(vo.priceData?.value ?? 0, vo.priceData?.currencyIso ?? 'USD'),
      currency: vo.priceData?.currencyIso ?? 'USD',
    },
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    position,
    metadata: vo as unknown as Record<string, unknown>,
  }
}
