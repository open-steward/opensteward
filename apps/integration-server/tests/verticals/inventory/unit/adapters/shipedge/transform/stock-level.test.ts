import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawShipEdgeStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('shipedge transformStockLevel', () => {
  const raw: RawShipEdgeStockLevel = {
    product_id: 'SE-PROD-100',
    sku: 'WKB-100',
    distribution_center: { id: 7, name: 'Main DC' },
    quantity_available: 150,
    quantity_in_warehouse: 200,
    quantity_hurt: 5,
    quantity_shipped: 10,
  }

  it('builds synthetic id as "<productId>:<locationId>"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('SE-PROD-100:7')
  })

  it('maps product_id to productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('SE-PROD-100')
  })

  it('maps distribution_center.id to locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('7')
  })

  it('prefers quantity_in_warehouse for quantityOnHand', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(200)
  })

  it('falls back to quantity_available for quantityOnHand when in_warehouse absent', () => {
    const noInWarehouse: RawShipEdgeStockLevel = { ...raw, quantity_in_warehouse: undefined }
    const result = transformStockLevel(noInWarehouse)
    expect(result.quantityOnHand).toBe(150)
  })

  it('maps quantity_available to quantityAvailable', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(150)
  })

  it('maps quantity_shipped to quantityCommitted', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(10)
  })

  it('falls back to "default" locationId when distribution_center absent', () => {
    const noDC: RawShipEdgeStockLevel = { product_id: 'P1', distribution_center: undefined }
    const result = transformStockLevel(noDC)
    expect(result.locationId).toBe('default')
  })

  it('satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
