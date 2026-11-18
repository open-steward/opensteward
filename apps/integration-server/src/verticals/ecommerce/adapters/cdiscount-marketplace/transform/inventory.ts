/**
 * Octopia offer → canonical InventoryLevel.
 *
 * `GET /seller/v2/offers` (docs:
 * https://developer.octopia-io.net/api-reference/offer-management/retrieve-offers/)
 * returns, verbatim per the docs' own example, an envelope
 * `{ items: [...], itemsPerPage }` where each item is:
 *
 *   { "sellerId": 1234, "sellerExternalReference": "REF001", "condition": "New",
 *     "salesChannelId": "CDISFR", "offerId": "1234_TES...", "offerState": "Active",
 *     "createdAt": "...", "updatedAt": "...",
 *     "product": { "reference": "TES3499550358636", "gtin": "..." },
 *     "integrationPrice": {...}, "facialPrice": {...},
 *     "deliveryOffers": [ { "preparationTime": 2, "supplyMode": "Seller", "quantity": 10, "isBestDelivery": true, "deliveryModes": [] } ] }
 *
 * Octopia has no seller warehouse/location resource (see `metadata.ts`), so
 * the canonical `locationId` is the offer's `salesChannelId` — the only
 * scoping Octopia exposes — and `available` sums every `deliveryOffers[].quantity`.
 * `variantId` is `sellerExternalReference`, the seller's own SKU: it is both
 * the confirmed filter Octopia supports for a single-offer lookup
 * (`sellerExternalReferences`, plural, comma-separated) AND the field the
 * write flow below keys on — NOT the same identifier space as
 * `Product.id` (`product.reference`; see `transform/product.ts`), which
 * Octopia does not expose as an offers-list filter.
 *
 * Writes go through the asynchronous offer-package flow (docs:
 * https://developer.octopia-io.net/api-reference/offer-management/offer-management-json/):
 * `POST /offer-packages` → `POST /offer-packages/{id}/offer-requests` (body
 * `[{ "sellerExternalReference": "SellerRef001", "quantity": 20 }]`, per the
 * docs' own example) → `PATCH /offer-packages/{id}` to submit. Quantity
 * there is always an ABSOLUTE value ("Your stock quantities are shared with
 * each sales channel…") — there is no delta operation, so
 * `adjustInventoryLevel` is declared unavailable.
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawOctopiaDeliveryOffer {
  quantity: number
  [key: string]: unknown
}

export interface RawOctopiaOffer {
  offerId: string
  sellerExternalReference: string
  salesChannelId: string
  deliveryOffers: RawOctopiaDeliveryOffer[]
  updatedAt?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawOctopiaOffer): InventoryLevel {
  const available = raw.deliveryOffers.reduce((sum, d) => sum + d.quantity, 0)
  return {
    id: `${raw.sellerExternalReference}:${raw.salesChannelId}`,
    variantId: raw.sellerExternalReference,
    locationId: raw.salesChannelId,
    available,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** One entry of `POST /offer-packages/{id}/offer-requests` (verbatim shape per the docs' own example). */
export function untransformInventoryLevel(data: {
  variantId: string
  available: number
}): Record<string, unknown> {
  return {
    sellerExternalReference: data.variantId,
    quantity: data.available,
  }
}
