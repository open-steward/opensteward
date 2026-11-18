/**
 * Doc: https://developer.octopia-io.net/api-reference/offer-management/retrieve-offers/
 * and .../offer-management/offer-management-json/ (verbatim examples quoted
 * in the source file header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawOctopiaOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawOctopiaOffer> = {}): RawOctopiaOffer {
  return {
    sellerId: 1234,
    sellerExternalReference: 'REF001',
    condition: 'New',
    salesChannelId: 'CDISFR',
    offerId: '1234_TES3499550358636_6_CDISFR',
    offerState: 'Active',
    createdAt: '2025-04-26T01:28:53.0000000+00:00',
    updatedAt: '2025-05-31T02:37:26.0000000+00:00',
    deliveryOffers: [{ preparationTime: 2, supplyMode: 'Seller', quantity: 10, isBestDelivery: true, deliveryModes: [] }],
    ...overrides,
  }
}

describe('transformInventoryLevel (Cdiscount Marketplace / Octopia)', () => {
  it('keys variantId on sellerExternalReference and locationId on salesChannelId', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.variantId).toBe('REF001')
    expect(result.locationId).toBe('CDISFR')
    expect(result.id).toBe('REF001:CDISFR')
  })

  it('sums quantity across every deliveryOffers entry', () => {
    const raw = makeRaw({
      deliveryOffers: [
        { preparationTime: 2, supplyMode: 'Seller', quantity: 10, isBestDelivery: true, deliveryModes: [] },
        { preparationTime: 1, supplyMode: 'Seller', quantity: 5, isBestDelivery: false, deliveryModes: [] },
      ],
    })
    expect(transformInventoryLevel(raw).available).toBe(15)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(makeRaw()))).not.toThrow()
  })
})

describe('untransformInventoryLevel (Cdiscount Marketplace / Octopia)', () => {
  it('builds an offer-package request entry keyed by sellerExternalReference', () => {
    expect(untransformInventoryLevel({ variantId: 'REF001', available: 20 })).toEqual({
      sellerExternalReference: 'REF001',
      quantity: 20,
    })
  })
})
