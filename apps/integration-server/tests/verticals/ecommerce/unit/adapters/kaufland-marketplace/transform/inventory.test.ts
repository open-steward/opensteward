import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawKauflandUnit,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeUnit(overrides: Partial<RawKauflandUnit> = {}): RawKauflandUnit {
  return {
    id_unit: 5001,
    id_offer: 'OFFER-99',
    id_warehouse: 200,
    amount: 42,
    date_lastchange_iso: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (kaufland-marketplace)', () => {
  it('synthesises id as variantId:locationId', () => {
    const result = transformInventoryLevel(makeUnit())
    expect(result.id).toBe('5001:200')
  })

  it('maps id_unit to variantId', () => {
    const result = transformInventoryLevel(makeUnit({ id_unit: 5001 }))
    expect(result.variantId).toBe('5001')
  })

  it('falls back to id_offer as variantId when id_unit is null', () => {
    const result = transformInventoryLevel(makeUnit({ id_unit: null, id_offer: 'OFF-1' }))
    expect(result.variantId).toBe('OFF-1')
  })

  it('maps id_warehouse to locationId', () => {
    const result = transformInventoryLevel(makeUnit({ id_warehouse: 200 }))
    expect(result.locationId).toBe('200')
  })

  it('falls back to "default" locationId when id_warehouse is null', () => {
    const result = transformInventoryLevel(makeUnit({ id_warehouse: null }))
    expect(result.locationId).toBe('default')
  })

  it('maps amount to available', () => {
    const result = transformInventoryLevel(makeUnit({ amount: 15 }))
    expect(result.available).toBe(15)
  })

  it('defaults available to 0 when amount is null', () => {
    const result = transformInventoryLevel(makeUnit({ amount: null }))
    expect(result.available).toBe(0)
  })

  it('maps date_lastchange_iso to updatedAt', () => {
    const result = transformInventoryLevel(makeUnit())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeUnit()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeUnit())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInventoryLevel (kaufland-marketplace)', () => {
  it('maps available to amount', () => {
    const body = untransformInventoryLevel({ available: 10 })
    expect(body.amount).toBe(10)
  })

  it('includes storefront when provided', () => {
    const body = untransformInventoryLevel({ available: 5, storefront: 'de' })
    expect(body.storefront).toBe('de')
  })

  it('round-trips available', () => {
    const canonical = transformInventoryLevel(makeUnit({ amount: 30 }))
    const body = untransformInventoryLevel(canonical)
    expect(body.amount).toBe(30)
  })
})
