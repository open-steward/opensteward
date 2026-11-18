import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawIqmetrixAvailability,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — iqmetrix availability', () => {
  const raw: RawIqmetrixAvailability = {
    Id: 'avail-uuid-001',
    CatalogItemId: 'cat-uuid-001',
    EntityId: 12,
    Quantity: 50,
    IsAvailable: true,
    LastModifiedDateUtc: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('sets id from Id', () => {
    expect(result.id).toBe('avail-uuid-001')
  })

  it('sets productId from CatalogItemId', () => {
    expect(result.productId).toBe('cat-uuid-001')
  })

  it('sets locationId from EntityId', () => {
    expect(result.locationId).toBe('12')
  })

  it('sets quantityOnHand from Quantity', () => {
    expect(result.quantityOnHand).toBe(50)
  })

  it('sets quantityAvailable = Quantity when IsAvailable is true', () => {
    expect(result.quantityAvailable).toBe(50)
  })

  it('sets lastCountedAt from LastModifiedDateUtc', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — not available', () => {
  const raw: RawIqmetrixAvailability = {
    Id: 'avail-uuid-002',
    CatalogItemId: 'cat-uuid-002',
    EntityId: 15,
    Quantity: 10,
    IsAvailable: false,
  }
  const result = transformStockLevel(raw)

  it('sets quantityAvailable to 0 when IsAvailable is false', () => {
    expect(result.quantityAvailable).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
