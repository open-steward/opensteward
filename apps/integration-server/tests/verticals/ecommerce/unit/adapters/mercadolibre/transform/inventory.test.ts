import { describe, it, expect } from 'vitest'
import { transformInventoryLevel } from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/inventory'
import type { RawMeliItem } from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawMeliItem> = {}): RawMeliItem {
  return {
    id: 'MLA123456789',
    title: 'Zapatillas Nike Air Max 90',
    available_quantity: 42,
    ...overrides,
  }
}

describe('transformInventoryLevel (Mercado Libre)', () => {
  it('synthesizes id as itemId:meli-default', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.id).toBe('MLA123456789:meli-default')
  })

  it('uses item ID as variantId', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.variantId).toBe('MLA123456789')
  })

  it('uses meli-default as locationId', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.locationId).toBe('meli-default')
  })

  it('maps available_quantity to available', () => {
    const result = transformInventoryLevel(makeItem({ available_quantity: 100 }))
    expect(result.available).toBe(100)
  })

  it('defaults to 0 when available_quantity is undefined', () => {
    const result = transformInventoryLevel(makeItem({ available_quantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })
})
