import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawFabricInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawFabricInventory> = {}): RawFabricInventory {
  return {
    id: 'inv-001',
    variant_id: 'var-001',
    sku: 'FB-SKU-001',
    location_id: 'loc-001',
    available: 50,
    committed: 10,
    incoming: 25,
    on_hand: 60,
    updated_at: '2024-07-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (fabric)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('inv-001')
    expect(result.variantId).toBe('var-001')
    expect(result.locationId).toBe('loc-001')
    expect(result.available).toBe(50)
    expect(result.committed).toBe(10)
    expect(result.incoming).toBe(25)
    expect(result.onHand).toBe(60)
    expect(result.updatedAt).toBe('2024-07-01T12:00:00Z')
  })

  it('defaults to sku when variant_id is missing', () => {
    const result = transformInventoryLevel(makeInventory({ variant_id: undefined }))
    expect(result.variantId).toBe('FB-SKU-001')
  })

  it('defaults to id when both variant_id and sku are missing', () => {
    const result = transformInventoryLevel(makeInventory({ variant_id: undefined, sku: undefined }))
    expect(result.variantId).toBe('inv-001')
  })

  it('defaults locationId to "default" when missing', () => {
    const result = transformInventoryLevel(makeInventory({ location_id: undefined }))
    expect(result.locationId).toBe('default')
  })

  it('computes onHand from available + committed when on_hand is missing', () => {
    const result = transformInventoryLevel(makeInventory({ on_hand: undefined }))
    expect(result.onHand).toBe(60) // 50 + 10
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('untransformInventoryLevel (fabric)', () => {
  it('builds the API body', () => {
    const body = untransformInventoryLevel({
      variantId: 'var-001',
      locationId: 'loc-001',
      available: 100,
    })
    expect(body).toEqual({
      variant_id: 'var-001',
      location_id: 'loc-001',
      available: 100,
    })
  })
})
