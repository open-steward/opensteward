import { describe, it, expect } from 'vitest'
import {
  transformAvailability,
  type RawSprykerAvailability,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeAvailability(
  overrides: Partial<RawSprykerAvailability['attributes']> = {},
): RawSprykerAvailability {
  return {
    type: 'concrete-product-availabilities',
    id: '001_black',
    attributes: {
      availability: true,
      quantity: '10',
      isNeverOutOfStock: false,
      ...overrides,
    },
  }
}

describe('transformAvailability (Spryker)', () => {
  it('composes id as variantSku:default', () => {
    const result = transformAvailability(makeAvailability(), 'SKU-001')
    expect(result.id).toBe('SKU-001:default')
    expect(result.variantId).toBe('SKU-001')
    expect(result.locationId).toBe('default')
  })

  it('parses string quantity to integer', () => {
    const result = transformAvailability(makeAvailability({ quantity: '7' }), 'SKU-001')
    expect(result.available).toBe(7)
  })

  it('floors decimal string quantity', () => {
    const result = transformAvailability(makeAvailability({ quantity: '4.9' }), 'SKU-001')
    expect(result.available).toBe(4)
  })

  it('handles numeric quantity', () => {
    const result = transformAvailability(makeAvailability({ quantity: 15 }), 'SKU-001')
    expect(result.available).toBe(15)
  })

  it('sets available=9999 when isNeverOutOfStock=true', () => {
    const result = transformAvailability(
      makeAvailability({ isNeverOutOfStock: true }),
      'SKU-001',
    )
    expect(result.available).toBe(9999)
  })

  it('defaults available to 0 when quantity is null', () => {
    const result = transformAvailability(makeAvailability({ quantity: null }), 'SKU-001')
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeAvailability()
    expect(transformAvailability(raw, 'SKU-001').metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() =>
      InventoryLevelSchema.parse(transformAvailability(makeAvailability(), 'SKU-001')),
    ).not.toThrow()
  })
})
