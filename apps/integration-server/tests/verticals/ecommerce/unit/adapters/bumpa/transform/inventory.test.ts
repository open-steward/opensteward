import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawBumpaInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

describe('transformInventoryLevel (bumpa)', () => {
  const raw: RawBumpaInventoryItem = {
    id: 500,
    product_id: 100,
    variant_id: 200,
    quantity: 30,
    available: 25,
    committed: 5,
    incoming: 10,
    on_hand: 30,
    location_id: 88,
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as variantId:locationId', () => {
    expect(transformInventoryLevel(raw).id).toBe('200:88')
  })

  it('maps variantId from variant_id', () => {
    expect(transformInventoryLevel(raw).variantId).toBe('200')
  })

  it('maps locationId from location_id', () => {
    expect(transformInventoryLevel(raw).locationId).toBe('88')
  })

  it('prefers available over quantity and stock', () => {
    expect(transformInventoryLevel(raw).available).toBe(25)
  })

  it('falls back to quantity when available not set', () => {
    const result = transformInventoryLevel({ ...raw, available: undefined })
    expect(result.available).toBe(30)
  })

  it('maps committed', () => {
    expect(transformInventoryLevel(raw).committed).toBe(5)
  })

  it('maps incoming', () => {
    expect(transformInventoryLevel(raw).incoming).toBe(10)
  })

  it('maps onHand from on_hand', () => {
    expect(transformInventoryLevel(raw).onHand).toBe(30)
  })

  it('defaults locationId to "default" when location_id absent', () => {
    const result = transformInventoryLevel({ ...raw, location_id: undefined })
    expect(result.locationId).toBe('default')
    expect(result.id).toBe('200:default')
  })

  it('falls back to product_id when variant_id absent', () => {
    const result = transformInventoryLevel({ ...raw, variant_id: undefined })
    expect(result.variantId).toBe('100')
  })

  it('passes InventoryLevelSchema validation', () => {
    expect(() => InventoryLevelSchema.parse(transformInventoryLevel(raw))).not.toThrow()
  })
})
