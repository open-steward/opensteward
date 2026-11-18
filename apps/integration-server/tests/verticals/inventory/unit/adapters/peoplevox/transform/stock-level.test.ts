import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawPeoplevoxInventorySite,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — peoplevox', () => {
  const raw: RawPeoplevoxInventorySite = {
    ItemCode: 'WK-2026',
    SiteName: 'Main Warehouse',
    SiteReference: 'WH-001',
    OnHand: '250',
    Available: '240',
    Allocated: '10',
    POQuantityOutstanding: '100',
  }
  const result = transformStockLevel(raw)

  it('builds composite id as <ItemCode>:<SiteReference>', () => {
    expect(result.id).toBe('WK-2026:WH-001')
  })

  it('maps productId from ItemCode', () => {
    expect(result.productId).toBe('WK-2026')
  })

  it('maps locationId from SiteReference', () => {
    expect(result.locationId).toBe('WH-001')
  })

  it('parses quantityOnHand from OnHand string', () => {
    expect(result.quantityOnHand).toBe(250)
  })

  it('parses quantityAvailable from Available string', () => {
    expect(result.quantityAvailable).toBe(240)
  })

  it('parses quantityCommitted from Allocated string', () => {
    expect(result.quantityCommitted).toBe(10)
  })

  it('parses quantityIncoming from POQuantityOutstanding string', () => {
    expect(result.quantityIncoming).toBe(100)
  })

  it('stores siteName in metadata', () => {
    expect(result.metadata['siteName']).toBe('Main Warehouse')
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — peoplevox fallbacks', () => {
  const raw: RawPeoplevoxInventorySite = {
    ItemCode: 'SKU-BACK',
    SiteName: 'Secondary Site',
    OnHand: '0',
  }
  const result = transformStockLevel(raw)

  it('falls back to SiteName for locationId when SiteReference absent', () => {
    expect(result.locationId).toBe('Secondary Site')
  })

  it('parses quantityOnHand as 0 from "0"', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('leaves quantityAvailable undefined when Available absent', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — peoplevox default locationId', () => {
  const raw: RawPeoplevoxInventorySite = {
    ItemCode: 'SKU-MIN',
    OnHand: '5',
  }
  const result = transformStockLevel(raw)

  it('uses "default" for locationId when SiteReference and SiteName both absent', () => {
    expect(result.locationId).toBe('default')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
