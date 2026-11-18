import { describe, it, expect } from 'vitest'
import { transformStockAdjustment } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

describe('transformStockAdjustment — pipe17 adjust event', () => {
  const raw = {
    eventId: 'evt_001',
    locationId: 'loc_sfo1',
    reason: 'cycle count',
    productId: 'prod_123',
    sku: 'WK-2026',
    delta: -5,
    counted: 95,
    notes: 'Counted during audit',
    adjustedAt: '2024-03-01T00:00:00Z',
    adjustedBy: 'Jane Doe',
  }
  const result = transformStockAdjustment(raw)

  it('sets id from eventId', () => {
    expect(result.id).toBe('evt_001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('evt_001')
  })

  it('sets locationId from raw.locationId', () => {
    expect(result.locationId).toBe('loc_sfo1')
  })

  it('maps reason "cycle count" → cycle_count', () => {
    expect(result.reason).toBe('cycle_count')
  })

  it('sets lines with one entry', () => {
    expect(result.lines).toHaveLength(1)
  })

  it('sets line productId from productId', () => {
    expect(result.lines[0]!.productId).toBe('prod_123')
  })

  it('sets deltaQuantity from delta', () => {
    expect(result.lines[0]!.deltaQuantity).toBe(-5)
  })

  it('sets countedQuantity from counted', () => {
    expect(result.lines[0]!.countedQuantity).toBe(95)
  })

  it('sets notes on the line', () => {
    expect(result.lines[0]!.notes).toBe('Counted during audit')
  })

  it('sets adjustedAt as ISO string', () => {
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets adjustedBy from adjustedBy field', () => {
    expect(result.adjustedBy).toBe('Jane Doe')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => StockAdjustmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockAdjustment — reason mapping', () => {
  const makeRaw = (reason: string) => ({
    eventId: 'e1',
    locationId: 'loc_1',
    reason,
    sku: 'SKU-1',
    delta: 0,
    adjustedAt: '2024-03-01T00:00:00Z',
  })

  it('maps "damage" → damage', () => {
    expect(transformStockAdjustment(makeRaw('damage write-off')).reason).toBe('damage')
  })

  it('maps "theft" → theft', () => {
    expect(transformStockAdjustment(makeRaw('theft')).reason).toBe('theft')
  })

  it('maps "lost" → lost', () => {
    expect(transformStockAdjustment(makeRaw('lost inventory')).reason).toBe('lost')
  })

  it('maps "found" → found', () => {
    expect(transformStockAdjustment(makeRaw('found items')).reason).toBe('found')
  })

  it('maps "expiration" → expiration', () => {
    expect(transformStockAdjustment(makeRaw('expiration')).reason).toBe('expiration')
  })

  it('maps "correction" → correction', () => {
    expect(transformStockAdjustment(makeRaw('manual correction')).reason).toBe('correction')
  })

  it('maps unknown → other', () => {
    expect(transformStockAdjustment(makeRaw('misc')).reason).toBe('other')
  })
})

describe('transformStockAdjustment — alias fields', () => {
  it('uses deltaQuantity when delta absent', () => {
    const result = transformStockAdjustment({
      eventId: 'e2',
      locationId: 'loc_1',
      deltaQuantity: 10,
      sku: 'SKU-1',
      adjustedAt: '2024-03-01T00:00:00Z',
    })
    expect(result.lines[0]!.deltaQuantity).toBe(10)
  })

  it('uses userId as adjustedBy fallback', () => {
    const result = transformStockAdjustment({
      eventId: 'e3',
      locationId: 'loc_1',
      delta: 0,
      sku: 'SKU-1',
      userId: 'user_42',
      adjustedAt: '2024-03-01T00:00:00Z',
    })
    expect(result.adjustedBy).toBe('user_42')
  })

  it('falls back adjustedAt to createdAt when adjustedAt absent', () => {
    const result = transformStockAdjustment({
      eventId: 'e4',
      locationId: 'loc_1',
      delta: 0,
      sku: 'SKU-1',
      createdAt: '2024-03-01T00:00:00Z',
    })
    expect(result.adjustedAt).toBe('2024-03-01T00:00:00.000Z')
  })
})
