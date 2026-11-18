import { describe, it, expect } from 'vitest'
import { transformStockLevel } from '../../../../../../../src/verticals/inventory/adapters/snipe-it/transform/stock-level'
import type { RawSnipeItAsset } from '../../../../../../../src/verticals/inventory/adapters/snipe-it/transform/product'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('snipe-it transformStockLevel', () => {
  const raw: RawSnipeItAsset = {
    id: 123,
    name: 'ThinkPad X1 Carbon',
    asset_tag: 'ASSET-0042',
    status_label: {
      id: 2,
      name: 'Ready to Deploy',
      status_type: 'deployable',
      status_meta: 'deployable',
    },
    location: { id: 7, name: 'Head Office' },
    last_audit_date: '2024-03-01T00:00:00Z',
  }

  it('synthesises id as "asset:<assetId>:<locationId>"', () => {
    const result = transformStockLevel(raw)
    expect(result.id).toBe('asset:123:7')
  })

  it('uses asset id as productId', () => {
    const result = transformStockLevel(raw)
    expect(result.productId).toBe('123')
    expect(result.platform).toBe('snipe-it')
  })

  it('uses location.id as locationId', () => {
    const result = transformStockLevel(raw)
    expect(result.locationId).toBe('7')
  })

  it('always sets quantityOnHand to 1', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityOnHand).toBe(1)
  })

  it('sets quantityAvailable=1 when status_meta is "deployable"', () => {
    const result = transformStockLevel(raw)
    expect(result.quantityAvailable).toBe(1)
  })

  it('sets quantityAvailable=0 when status_meta is not "deployable"', () => {
    const result = transformStockLevel({
      ...raw,
      status_label: { id: 4, name: 'Archived', status_type: 'archived', status_meta: 'Archived' },
    })
    expect(result.quantityAvailable).toBe(0)
  })

  it('maps last_audit_date to lastCountedAt', () => {
    const result = transformStockLevel(raw)
    expect(result.lastCountedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets empty locationId when location is absent', () => {
    const { location: _, ...noLoc } = raw
    const result = transformStockLevel(noLoc)
    expect(result.locationId).toBe('')
    expect(result.id).toBe('asset:123:')
  })

  it('produces output satisfying StockLevelSchema', () => {
    const result = transformStockLevel(raw)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
