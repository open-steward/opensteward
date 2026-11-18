import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWalmartInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/walmart/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(
  overrides: Partial<RawWalmartInventoryItem> = {},
): RawWalmartInventoryItem {
  return {
    sku: 'WM-WIDGET-001',
    quantity: { unit: 'EACH', amount: 150 },
    fulfillmentLagTime: 1,
    ...overrides,
  }
}

describe('transformInventoryLevel (Walmart)', () => {
  it('maps SKU and quantity to canonical inventory level', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.variantId).toBe('WM-WIDGET-001')
    expect(result.available).toBe(150)
    expect(result.locationId).toBe('walmart-default')
  })

  it('uses shipNode as locationId when present', () => {
    const result = transformInventoryLevel(
      makeInventory({ shipNode: 'FC-DFW1' }),
    )
    expect(result.locationId).toBe('FC-DFW1')
    expect(result.id).toBe('WM-WIDGET-001:FC-DFW1')
  })

  it('synthesizes id as sku:locationId', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.id).toBe('WM-WIDGET-001:walmart-default')
  })

  it('defaults quantity to 0 when missing', () => {
    const result = transformInventoryLevel(makeInventory({ quantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw)
    expect(result.metadata['fulfillmentLagTime']).toBe(1)
    expect(result.metadata['sku']).toBe('WM-WIDGET-001')
  })
})
