/**
 * Newegg Volume Discount → canonical Discount.
 *
 * Newegg supports item-level volume (quantity-based) discounts.
 * Each discount has up to 3 tiers keyed by minimum purchase quantity.
 *
 * Docs: https://developer.newegg.com/newegg_marketplace_api/item_management/get_volume_discount_request_result/
 *
 * Read endpoint (PUT with OperationType=GetVolumeDiscountRequest):
 *   PUT /contentmgmt/item/volumediscount?sellerid={sellerid}
 *   Request body: { OperationType: 'GetVolumeDiscountRequest', SellerPartNumber | NeweggItemNumber }
 *   Response: { SellerPartNumber, NeweggItemNumber, DiscountSetting: { Tier: [...] } }
 *
 * Write endpoint (POST):
 *   POST /contentmgmt/item/volumediscount?sellerid={sellerid}
 *   OperationType: SubmitVolumeDiscountRequest
 */

import type { Discount } from '../../../schema/discount'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggDiscountTier {
  Priority?: number
  Quantity?: number
  SellingPrice?: number
  EnableFreeShipping?: number
  [key: string]: unknown
}

export interface RawNeweggVolumeDiscount {
  SellerPartNumber?: string
  NeweggItemNumber?: string
  VolumeActivation?: boolean
  DiscountSetting?: {
    Tier?: RawNeweggDiscountTier[]
  }
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Newegg Volume Discount → canonical Discount.
 *
 * Newegg volume discounts are quantity-tier price reductions on a specific
 * item. We represent the lowest-tier (priority 1) selling price as the
 * discount value, and the type is FIXED_AMOUNT (absolute price, not a
 * percentage reduction).
 */
export function transformDiscount(raw: RawNeweggVolumeDiscount): Discount {
  const itemId = raw.NeweggItemNumber ?? raw.SellerPartNumber ?? ''
  const tiers = raw.DiscountSetting?.Tier ?? []

  // Lowest-priority tier (Priority 1) represents the first discount level.
  const firstTier = tiers.find((t) => t.Priority === 1) ?? tiers[0]

  const code = raw.SellerPartNumber
    ? `VOL-${raw.SellerPartNumber}`
    : raw.NeweggItemNumber
      ? `VOL-${raw.NeweggItemNumber}`
      : `VOL-${itemId}`

  return {
    id: itemId,
    code,
    title: `Volume discount for ${raw.SellerPartNumber ?? raw.NeweggItemNumber ?? itemId}`,
    type: 'FIXED_AMOUNT',
    value: firstTier?.SellingPrice,
    currency: 'USD',
    appliesTo: 'PRODUCTS',
    productIds: itemId ? [itemId] : [],
    minimumPurchaseAmount:
      firstTier?.Quantity != null
        ? { amount: firstTier.Quantity, currency: 'USD' }
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Discount → Newegg volume discount submission body.
 */
export function untransformDiscount(data: Partial<Discount>): Record<string, unknown> {
  return {
    OperationType: 'SubmitVolumeDiscountRequest',
    SellerPartNumber: data.productIds?.[0] ?? data.id,
    VolumeActivation: true,
    DiscountSetting: {
      Tier: [
        {
          Priority: 1,
          Quantity: 1,
          SellingPrice: data.value ?? 0,
          EnableFreeShipping: 0,
        },
      ],
    },
  }
}
