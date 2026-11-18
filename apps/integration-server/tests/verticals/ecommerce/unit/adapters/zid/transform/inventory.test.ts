import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawZidInventoryInput,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInput(overrides: Partial<RawZidInventoryInput> = {}): RawZidInventoryInput {
  return {
    productId: 'prod-zid-001',
    stock: {
      location: 'riyadh-warehouse',
      available_quantity: 25,
    },
    ...overrides,
  }
}

describe('transformInventoryLevel (Zid)', () => {
  it('synthesises id as productId:locationSlug', () => {
    const result = transformInventoryLevel(makeInput())
    expect(result.id).toBe('prod-zid-001:riyadh-warehouse')
  })

  it('uses productId as variantId', () => {
    const result = transformInventoryLevel(makeInput())
    expect(result.variantId).toBe('prod-zid-001')
  })

  it('uses location as locationId', () => {
    const result = transformInventoryLevel(makeInput())
    expect(result.locationId).toBe('riyadh-warehouse')
  })

  it('defaults locationId to "default" when stock.location is null', () => {
    const result = transformInventoryLevel(
      makeInput({ stock: { location: null, available_quantity: 10 } }),
    )
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('prod-zid-001:default')
  })

  it('maps available_quantity to available', () => {
    const result = transformInventoryLevel(makeInput())
    expect(result.available).toBe(25)
  })

  it('defaults available to 0 when available_quantity is null', () => {
    const result = transformInventoryLevel(
      makeInput({ stock: { location: 'wh', available_quantity: null } }),
    )
    expect(result.available).toBe(0)
  })

  it('stores raw input in metadata', () => {
    const raw = makeInput()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInput())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
