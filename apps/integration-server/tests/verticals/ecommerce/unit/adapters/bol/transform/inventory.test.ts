import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawBolInventoryOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/bol/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(
  overrides: Partial<RawBolInventoryOffer> = {},
): RawBolInventoryOffer {
  return {
    ean: '8712345678901',
    bsku: 'BSKU-001',
    nckStock: 10,
    stock: 42,
    title: 'Premium Dutch Widget',
    ...overrides,
  }
}

describe('transformInventoryLevel (Bol.com)', () => {
  it('uses EAN as variantId and synthetic bol-default location', () => {
    const lvl = transformInventoryLevel(makeInventory())
    expect(lvl.id).toBe('8712345678901:bol-default')
    expect(lvl.variantId).toBe('8712345678901')
    expect(lvl.locationId).toBe('bol-default')
  })

  it('reads stock as the available quantity', () => {
    const lvl = transformInventoryLevel(makeInventory())
    expect(lvl.available).toBe(42)
  })

  it('falls back to nckStock when stock is absent', () => {
    const lvl = transformInventoryLevel(makeInventory({ stock: undefined }))
    expect(lvl.available).toBe(10)
  })

  it('defaults to 0 when no stock fields are present', () => {
    const lvl = transformInventoryLevel(
      makeInventory({ stock: undefined, nckStock: undefined }),
    )
    expect(lvl.available).toBe(0)
  })

  it('falls back to bsku when ean is absent', () => {
    const lvl = transformInventoryLevel(makeInventory({ ean: undefined }))
    expect(lvl.variantId).toBe('BSKU-001')
    expect(lvl.id).toBe('BSKU-001:bol-default')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventory()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})
