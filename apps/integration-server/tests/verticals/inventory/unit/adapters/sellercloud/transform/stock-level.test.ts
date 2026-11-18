import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawSellercloudStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('sellercloud transformStockLevel', () => {
  const raw: RawSellercloudStockLevel = {
    ProductID: 'PROD-001',
    WarehouseID: 7,
    PhysicalQty: 250,
    AvailableQty: 230,
    ReservedQty: 20,
    OnOrder: 100,
  }

  it('builds synthetic id as "<productId>:<locationId>"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('PROD-001:7')
  })

  it('maps ProductID to productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('PROD-001')
  })

  it('maps WarehouseID to locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('7')
  })

  it('maps PhysicalQty to quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps AvailableQty to quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(230)
  })

  it('maps ReservedQty to quantityCommitted', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(20)
  })

  it('maps OnOrder to quantityIncoming', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityIncoming).toBe(100)
  })

  it('defaults quantityOnHand to 0 when PhysicalQty absent', () => {
    const noQty: RawSellercloudStockLevel = { ProductID: 'P1', WarehouseID: 1 }
    const result = transformStockLevel(noQty)
    expect(result.quantityOnHand).toBe(0)
  })

  it('satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
