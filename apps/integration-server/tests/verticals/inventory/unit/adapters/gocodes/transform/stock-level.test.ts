import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawGocodesStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/gocodes/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — gocodes', () => {
  const raw: RawGocodesStockLevel = {
    asset_id: 'asset-001',
    location_id: 'loc-001',
    quantity_on_hand: 5,
    quantity_checked_out: 2,
    last_audit_date: '2024-03-01T00:00:00Z',
  }
  const result = transformStockLevel(raw)

  it('builds composite id from asset_id and location_id', () => {
    expect(result.id).toBe('asset-001:loc-001')
  })

  it('maps productId from asset_id', () => {
    expect(result.productId).toBe('asset-001')
  })

  it('maps locationId from location_id', () => {
    expect(result.locationId).toBe('loc-001')
  })

  it('maps quantityOnHand from quantity_on_hand', () => {
    expect(result.quantityOnHand).toBe(5)
  })

  it('maps quantityCommitted from quantity_checked_out', () => {
    expect(result.quantityCommitted).toBe(2)
  })

  it('maps lastCountedAt from last_audit_date', () => {
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to gocodes', () => {
    expect(result.platform).toBe('gocodes')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — gocodes default quantityOnHand', () => {
  const raw: RawGocodesStockLevel = {
    asset_id: 'asset-002',
    location_id: 'loc-002',
  }
  const result = transformStockLevel(raw)

  it('defaults quantityOnHand to 1 when quantity_on_hand absent', () => {
    expect(result.quantityOnHand).toBe(1)
  })

  it('leaves quantityCommitted undefined when quantity_checked_out absent', () => {
    expect(result.quantityCommitted).toBeUndefined()
  })

  it('leaves lastCountedAt undefined when last_audit_date absent', () => {
    expect(result.lastCountedAt).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
