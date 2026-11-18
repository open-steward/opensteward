import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/picqer/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — picqer stock history', () => {
  const raw = {
    idproduct_stock_history: 9001,
    idproduct: 1001,
    idwarehouse: 3,
    idlocation: 10,
    iduser: 5,
    old_stock: 50,
    stock_change: -10,
    new_stock: 40,
    reason: 'correction made by manager',
    change_type: 'manual',
    changed_at: '2024-03-01T00:00:00Z',
  }
  const result = transformStockAdjustment(raw)

  it('sets id from idproduct_stock_history as string', () => {
    expect(result.id).toBe('9001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('9001')
  })

  it('sets locationId from idwarehouse', () => {
    expect(result.locationId).toBe('3')
  })

  it('maps change_type "manual" → correction', () => {
    expect(result.reason).toBe('correction')
  })

  it('sets lines with one entry', () => {
    expect(result.lines).toHaveLength(1)
  })

  it('sets line productId from idproduct', () => {
    expect(result.lines[0]!.productId).toBe('1001')
  })

  it('sets deltaQuantity from stock_change', () => {
    expect(result.lines[0]!.deltaQuantity).toBe(-10)
  })

  it('sets countedQuantity from new_stock', () => {
    expect(result.lines[0]!.countedQuantity).toBe(40)
  })

  it('sets adjustedAt as ISO string', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to picqer', () => {
    expect(result.platform).toBe('picqer')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — reason mapping', () => {
  const makeRaw = (change_type: string, reason?: string) => ({
    idproduct_stock_history: 1,
    idproduct: 1,
    stock_change: 0,
    change_type,
    reason,
    changed_at: '2024-03-01T00:00:00Z',
  })

  it('maps change_type "stockcount" → cycle_count', () => {
    expect(transformStockAdjustment(makeRaw('stockcount')).reason).toBe('cycle_count')
  })

  it('maps reason containing "damage" → damage', () => {
    expect(transformStockAdjustment(makeRaw('api', 'product damage')).reason).toBe('damage')
  })

  it('maps reason containing "theft" → theft', () => {
    expect(transformStockAdjustment(makeRaw('api', 'theft incident')).reason).toBe('theft')
  })

  it('maps reason containing "lost" → lost', () => {
    expect(transformStockAdjustment(makeRaw('api', 'items lost')).reason).toBe('lost')
  })

  it('maps reason containing "found" → found', () => {
    expect(transformStockAdjustment(makeRaw('api', 'found items')).reason).toBe('found')
  })

  it('maps reason containing "expir" → expiration', () => {
    expect(transformStockAdjustment(makeRaw('api', 'product expiration')).reason).toBe('expiration')
  })

  it('maps unknown type/reason → other', () => {
    expect(transformStockAdjustment(makeRaw('import', undefined)).reason).toBe('other')
  })
})

describe('transformStockAdjustment — missing warehouse', () => {
  const result = transformStockAdjustment({
    idproduct_stock_history: 2,
    idproduct: 10,
    stock_change: 5,
  })

  it('sets locationId to empty string when idwarehouse absent', () => {
    expect(result.locationId).toBe('')
  })

  it('defaults adjustedAt to epoch when changed_at absent', () => {
    expect(result.adjustedAt).toBe(new Date(0).toISOString())
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})
