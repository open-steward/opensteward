import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawVarioArticleStorage,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

const baseRaw: RawVarioArticleStorage = {
  _articleId: 'art-001',
  _storageId: 'stor-007',
  quantityInStock: 250,
  stockAvailable: 240,
  reservedQuantity: 10,
  orderedQuantity: 50,
  quantityInPicking: 2,
  quantityInFabrication: 0,
}

describe('vario-software transformStockLevel', () => {
  it('builds composite id from _articleId and _storageId', () => {
    expect(transformStockLevel(baseRaw).id).toBe('art-001:stor-007')
  })

  it('maps productId from _articleId', () => {
    expect(transformStockLevel(baseRaw).productId).toBe('art-001')
  })

  it('maps locationId from _storageId', () => {
    expect(transformStockLevel(baseRaw).locationId).toBe('stor-007')
  })

  it('maps quantityOnHand from quantityInStock', () => {
    expect(transformStockLevel(baseRaw).quantityOnHand).toBe(250)
  })

  it('falls back to stockAmount when quantityInStock is absent', () => {
    const raw: RawVarioArticleStorage = { ...baseRaw, quantityInStock: undefined, stockAmount: 300 }
    expect(transformStockLevel(raw).quantityOnHand).toBe(300)
  })

  it('maps quantityAvailable from stockAvailable', () => {
    expect(transformStockLevel(baseRaw).quantityAvailable).toBe(240)
  })

  it('maps quantityCommitted from reservedQuantity', () => {
    expect(transformStockLevel(baseRaw).quantityCommitted).toBe(10)
  })

  it('maps quantityIncoming from orderedQuantity', () => {
    expect(transformStockLevel(baseRaw).quantityIncoming).toBe(50)
  })

  it('sets platform to vario-software', () => {
    expect(transformStockLevel(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(baseRaw))).not.toThrow()
  })
})
