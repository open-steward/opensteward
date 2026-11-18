import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawStockTrimStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — stocktrim', () => {
  const raw: RawStockTrimStockLevel = {
    productId: 'PROD-001',
    locationCode: 'WH-SFO',
    locationName: 'SF Warehouse',
    stockOnHand: 250,
    stockOnOrder: 100,
  }
  const result = transformStockLevel(raw)

  it('builds synthetic id as productId:locationCode', () => {
    expect(result.id).toBe('PROD-001:WH-SFO')
  })

  it('sets externalId equal to synthetic id', () => {
    expect(result.externalId).toBe('PROD-001:WH-SFO')
  })

  it('maps productId', () => {
    expect(result.productId).toBe('PROD-001')
  })

  it('maps locationId from locationCode', () => {
    expect(result.locationId).toBe('WH-SFO')
  })

  it('maps quantityOnHand from stockOnHand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('maps quantityIncoming from stockOnOrder', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('stores locationName in metadata', () => {
    expect(result.metadata['locationName']).toBe('SF Warehouse')
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — stocktrim locationName fallback', () => {
  const raw: RawStockTrimStockLevel = {
    productId: 'PROD-002',
    locationName: 'NYC Warehouse',
    stockOnHand: 0,
  }
  const result = transformStockLevel(raw)

  it('falls back locationId to locationName when locationCode absent', () => {
    expect(result.locationId).toBe('NYC Warehouse')
  })

  it('defaults quantityOnHand to 0', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
