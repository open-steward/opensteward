import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — pipe17 inventory record', () => {
  const raw = {
    sku: 'WK-2026',
    locationId: 'loc_sfo1',
    onHand: 250,
    available: 230,
    committed: 20,
    future: 0,
    incoming: 100,
    unavailable: 5,
    committedFuture: 0,
    integration: 'shipbob',
  }
  const result = transformStockLevel(raw)

  it('sets id as sku:locationId', () => {
    expect(result.id).toBe('WK-2026:loc_sfo1')
  })

  it('sets productId from sku', () => {
    expect(result.productId).toBe('WK-2026')
  })

  it('sets locationId from raw.locationId', () => {
    expect(result.locationId).toBe('loc_sfo1')
  })

  it('sets quantityOnHand from onHand', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('sets quantityAvailable from available', () => {
    expect(result.quantityAvailable).toBe(230)
  })

  it('sets quantityCommitted from committed', () => {
    expect(result.quantityCommitted).toBe(20)
  })

  it('sets quantityIncoming from incoming', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('stores integration in metadata', () => {
    expect(result.metadata['integration']).toBe('shipbob')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — minimal input', () => {
  const result = transformStockLevel({})

  it('defaults quantityOnHand to 0 when onHand absent', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('sets id as colon-separated empty strings when both fields absent', () => {
    expect(result.id).toBe(':')
  })

  it('leaves quantityAvailable undefined when available absent', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
