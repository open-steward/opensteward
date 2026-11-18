import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  extractId,
  type RawRevelInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawRevelInventory> = {}): RawRevelInventory {
  return {
    id: 500,
    product: '/resources/Product/101/',
    establishment: '/resources/Establishment/1/',
    quantity: 25,
    updated_date: '2024-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('extractId', () => {
  it('extracts ID from resource URI', () => {
    expect(extractId('/resources/Product/123/')).toBe('123')
  })

  it('handles numeric input', () => {
    expect(extractId(42)).toBe('42')
  })

  it('returns empty string for null/undefined', () => {
    expect(extractId(null)).toBe('')
    expect(extractId(undefined)).toBe('')
  })

  it('returns the string itself if no match', () => {
    expect(extractId('plain')).toBe('plain')
  })
})

describe('transformInventoryLevel (Revel)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('500')
    expect(result.variantId).toBe('101')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(25)
  })

  it('maps timestamps', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.updatedAt).toBe('2024-04-01T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('synthesizes ID from variantId:locationId when id is missing', () => {
    const raw: RawRevelInventory = {
      id: 0,
      product: '/resources/Product/10/',
      establishment: '/resources/Establishment/2/',
      quantity: 5,
    }
    // id is falsy (0), so it falls back to composite
    const result = transformInventoryLevel(raw)
    expect(result.id).toBe('10:2')
  })

  it('defaults quantity to 0 when missing', () => {
    const result = transformInventoryLevel(makeInventory({ quantity: undefined }))
    expect(result.available).toBe(0)
  })
})
