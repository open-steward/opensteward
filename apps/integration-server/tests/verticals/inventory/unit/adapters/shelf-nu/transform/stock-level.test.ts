import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawShelfNuAssetForStock,
} from '../../../../../../../src/verticals/inventory/adapters/shelf-nu/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('shelf-nu transformStockLevel', () => {
  const raw: RawShelfNuAssetForStock = {
    id: 'asset-abc',
    status: 'AVAILABLE',
    locationId: 'loc-42',
    location: { id: 'loc-42', name: 'Cabinet A' },
    updatedAt: '2024-03-01T00:00:00Z',
  }

  it('builds synthetic id as "<assetId>:<locationId>"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('asset-abc:loc-42')
  })

  it('maps id to productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('asset-abc')
  })

  it('maps locationId to locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('loc-42')
  })

  it('always returns quantityOnHand of 1', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(1)
  })

  it('sets quantityAvailable 1 for AVAILABLE status', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(1)
  })

  it('sets quantityAvailable 0 for non-AVAILABLE status', () => {
    const checkedOut: RawShelfNuAssetForStock = { ...raw, status: 'CHECKED_OUT' }
    expect(transformStockLevel(checkedOut).quantityAvailable).toBe(0)
  })

  it('sets quantityCommitted 1 for IN_CUSTODY status', () => {
    const inCustody: RawShelfNuAssetForStock = { ...raw, status: 'IN_CUSTODY' }
    expect(transformStockLevel(inCustody).quantityCommitted).toBe(1)
  })

  it('sets quantityCommitted 1 for CHECKED_OUT status', () => {
    const checkedOut: RawShelfNuAssetForStock = { ...raw, status: 'CHECKED_OUT' }
    expect(transformStockLevel(checkedOut).quantityCommitted).toBe(1)
  })

  it('sets quantityCommitted 0 for AVAILABLE status', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityCommitted).toBe(0)
  })

  it('maps updatedAt to lastCountedAt', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to location.id when locationId field absent', () => {
    const noLocId: RawShelfNuAssetForStock = {
      id: 'asset-xyz',
      locationId: null,
      location: { id: 'loc-99', name: 'Shelf' },
    }
    const result = transformStockLevel(noLocId)
    expect(result.locationId).toBe('loc-99')
  })

  it('satisfies StockLevelSchema', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(raw))).not.toThrow()
  })
})
