import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSphereWmsInventory,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — spherewms', () => {
  const raw: RawSphereWmsInventory = {
    product_id: 'PROD-42',
    location_id: 'LOC-001',
    client_code: 'CLIENT-1',
    total_on_hand: 250,
    total_available: 240,
    total_allocated: 10,
    on_purchase: 100,
    on_order: 50,
    on_transfer: 5,
  }
  const result = transformStockLevel(raw)

  it('builds synthetic id as productId:locationId', () => {
    expect(result.id).toBe('PROD-42:LOC-001')
  })

  it('maps productId from product_id', () => {
    expect(result.productId).toBe('PROD-42')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('LOC-001')
  })

  it('maps quantityOnHand from total_on_hand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityAvailable from total_available', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from total_allocated', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from on_purchase', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('stores on_order in metadata', () => {
    expect(result.metadata['onOrder']).toBe('50')
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — spherewms product_code fallback', () => {
  const raw: RawSphereWmsInventory = {
    product_code: 'SKU-X',
    location_id: 'LOC-002',
    total_on_hand: 0,
  }
  const result = transformStockLevel(raw)

  it('falls back productId to product_code', () => {
    expect(result.productId).toBe('SKU-X')
  })

  it('defaults quantityOnHand to 0', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
