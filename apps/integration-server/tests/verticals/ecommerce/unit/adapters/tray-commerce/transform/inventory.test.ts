/**
 * Docs: https://developers.tray.com.br/ `#consultar-estoque-de-produto-do-cd-get`
 * — fetched with curl; see `transform/inventory.ts` header for the
 * confirmed Multi-CD stock JSON shape.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawTrayCdStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawTrayCdStock> = {}): RawTrayCdStock {
  return { dc_id: 1, stock: 7, ...overrides }
}

describe('transformInventoryLevel (Tray Commerce Multi-CD stock)', () => {
  it('composes id from productId:dc_id', () => {
    const result = transformInventoryLevel('10', makeStock())
    expect(result.id).toBe('10:1')
  })

  it('uses the product id as variantId (the endpoint is scoped by product, not variant)', () => {
    const result = transformInventoryLevel('10', makeStock())
    expect(result.variantId).toBe('10')
  })

  it('maps dc_id to locationId and stock to available', () => {
    const result = transformInventoryLevel('10', makeStock({ dc_id: 3, stock: 99 }))
    expect(result.locationId).toBe('3')
    expect(result.available).toBe(99)
  })

  it('parses a string stock value', () => {
    const result = transformInventoryLevel('10', makeStock({ stock: '42' }))
    expect(result.available).toBe(42)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    expect(transformInventoryLevel('10', raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel('10', makeStock()))).not.toThrow()
  })
})
