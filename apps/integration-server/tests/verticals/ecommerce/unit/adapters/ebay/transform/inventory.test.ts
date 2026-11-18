import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/inventory'
import type { RawEbayInventoryItem } from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawEbayInventoryItem> = {}): RawEbayInventoryItem {
  return {
    sku: 'WIDGET-001',
    product: {
      title: 'Widget',
    },
    condition: 'NEW',
    availability: {
      shipToLocationAvailability: {
        quantity: 42,
      },
    },
    ...overrides,
  }
}

describe('transformInventoryLevel (eBay)', () => {
  it('uses the SKU as variantId and a synthetic ebay-default location', () => {
    const lvl = transformInventoryLevel(makeItem())
    expect(lvl.id).toBe('WIDGET-001:ebay-default')
    expect(lvl.variantId).toBe('WIDGET-001')
    expect(lvl.locationId).toBe('ebay-default')
  })

  it('reads quantity from shipToLocationAvailability', () => {
    const lvl = transformInventoryLevel(makeItem())
    expect(lvl.available).toBe(42)
  })

  it('defaults to 0 when availability is absent', () => {
    const lvl = transformInventoryLevel(makeItem({ availability: undefined }))
    expect(lvl.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeItem())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})
