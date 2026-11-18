import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawEcwidProductStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (Ecwid)', () => {
  it('maps combination stock to canonical InventoryLevel', () => {
    const raw: RawEcwidProductStock = {
      id: 501,
      quantity: 42,
      unlimited: false,
    }
    const result = transformInventoryLevel(raw, '100')
    expect(result.id).toBe('100:501:default')
    expect(result.variantId).toBe('100:501')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(42)
  })

  it('defaults to 0 when quantity is null', () => {
    const raw: RawEcwidProductStock = {
      id: 502,
      quantity: null,
    }
    const result = transformInventoryLevel(raw, '100')
    expect(result.available).toBe(0)
  })

  it('produces a schema-valid result', () => {
    const raw: RawEcwidProductStock = { id: 503, quantity: 10 }
    const result = transformInventoryLevel(raw, '200')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
