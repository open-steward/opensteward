import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawZalandoStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/zalando/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawZalandoStock> = {}): RawZalandoStock {
  return {
    ean: '4006381333931',
    available: 50,
    on_hand: 55,
    reserved: 5,
    location_id: 'wh-berlin-01',
    updated_at: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Zalando)', () => {
  it('synthesises id as ean:locationId', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('4006381333931:wh-berlin-01')
  })

  it('uses EAN as variantId', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.variantId).toBe('4006381333931')
  })

  it('uses location_id as locationId', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.locationId).toBe('wh-berlin-01')
  })

  it('defaults to zalando-warehouse when location_id is absent', () => {
    const result = transformInventoryLevel(makeStock({ location_id: null }))
    expect(result.locationId).toBe('zalando-warehouse')
    expect(result.id).toBe('4006381333931:zalando-warehouse')
  })

  it('maps available quantity', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.available).toBe(50)
  })

  it('defaults available to 0 when absent', () => {
    const result = transformInventoryLevel(makeStock({ available: null }))
    expect(result.available).toBe(0)
  })

  it('maps reserved to committed', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.committed).toBe(5)
  })

  it('maps on_hand to onHand', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.onHand).toBe(55)
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformInventoryLevel(makeStock())
    // toIsoDatetime normalises to .000Z millisecond precision
    expect(result.updatedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('leaves committed undefined when reserved is null', () => {
    const result = transformInventoryLevel(makeStock({ reserved: null }))
    expect(result.committed).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInventoryLevel (Zalando)', () => {
  it('maps ean and available to snake_case keys', () => {
    const body = untransformInventoryLevel({ ean: '4006381333931', available: 42 })
    expect(body.ean).toBe('4006381333931')
    expect(body.available).toBe(42)
  })
})
