import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawQoblexVariantLocation,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('qoblex transformStockLevel', () => {
  const raw: RawQoblexVariantLocation = {
    product_variant_id: 101,
    location_id: 42,
    quantity: 250,
    allocated_quantity: 10,
    incoming_quantity: 100,
    buffer_quantity: 5,
    bin_number: 'A1-B2',
    alert_level: 20,
  }

  it('constructs synthetic id as variantId:locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('101:42')
    expect(result.productId).toBe('101')
    expect(result.locationId).toBe('42')
  })

  it('maps quantityOnHand from quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('computes quantityAvailable as quantity - allocated_quantity', () => {
    const result = transformStockLevel(raw)
    // 250 - 10 = 240
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from allocated_quantity', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('omits quantityAvailable when either quantity or allocated_quantity is absent', () => {
    const result = transformStockLevel({ ...raw, allocated_quantity: undefined })
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('stores bin_number and alert_level in metadata', () => {
    const result = transformStockLevel(raw)
    expect(result.metadata['binNumber']).toBe('A1-B2')
    expect(result.metadata['alertLevel']).toBe('20')
  })

  it('defaults quantityOnHand to 0 when quantity is absent', () => {
    const result = transformStockLevel({ ...raw, quantity: undefined })
    expect(result.quantityOnHand).toBe(0)
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
