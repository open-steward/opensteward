import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawChannelAdvisorDCQuantity,
} from '../../../../../../../src/verticals/inventory/adapters/channeladvisor/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('channeladvisor transformStockLevel', () => {
  it('constructs a composite id from productId and locationId', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 101,
      DistributionCenterID: 5,
      AvailableQuantity: 50,
    }
    const result = transformStockLevel(raw)

    expect(result.id).toBe('101:5')
    expect(result.productId).toBe('101')
    expect(result.locationId).toBe('5')
  })

  it('maps AvailableQuantity to both quantityOnHand and quantityAvailable', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 10,
      DistributionCenterID: 2,
      AvailableQuantity: 75,
    }
    const result = transformStockLevel(raw)

    expect(result.quantityOnHand).toBe(75)
    expect(result.quantityAvailable).toBe(75)
  })

  it('defaults quantityOnHand to 0 when AvailableQuantity is absent', () => {
    const raw: RawChannelAdvisorDCQuantity = { ProductID: 1, DistributionCenterID: 1 }
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets untracked fields to undefined', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 1,
      DistributionCenterID: 1,
      AvailableQuantity: 10,
    }
    const result = transformStockLevel(raw)

    expect(result.quantityCommitted).toBeUndefined()
    expect(result.quantityIncoming).toBeUndefined()
    expect(result.reorderPoint).toBeUndefined()
    expect(result.reorderQuantity).toBeUndefined()
    expect(result.lastCountedAt).toBeUndefined()
  })

  it('stores profileId in metadata', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 1,
      DistributionCenterID: 1,
      ProfileID: 9999,
    }
    const result = transformStockLevel(raw)
    expect(result.metadata['profileId']).toBe('9999')
  })

  it('handles string IDs without coercion issues', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 'prod-abc',
      DistributionCenterID: 'dc-xyz',
      AvailableQuantity: 5,
    }
    const result = transformStockLevel(raw)
    expect(result.id).toBe('prod-abc:dc-xyz')
  })

  it('passes StockLevelSchema validation', () => {
    const raw: RawChannelAdvisorDCQuantity = {
      ProductID: 101,
      DistributionCenterID: 5,
      ProfileID: 1234,
      AvailableQuantity: 50,
    }
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
