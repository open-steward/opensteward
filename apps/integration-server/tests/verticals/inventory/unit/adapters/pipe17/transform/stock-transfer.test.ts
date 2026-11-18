import { describe, it, expect } from 'vitest'
import { transformStockTransfer } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — pipe17 transfer', () => {
  const raw = {
    transferId: 'tr_001',
    number: 'TR-1042',
    fromLocationId: 'loc_sfo1',
    toLocationId: 'loc_nyc1',
    status: 'in_transit',
    lines: [
      {
        productId: 'prod_123',
        sku: 'WK-2026',
        quantity: 50,
        quantityReceived: 0,
      },
    ],
    shippedAt: '2024-03-01T00:00:00Z',
    receivedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformStockTransfer(raw)

  it('sets id from transferId', () => {
    expect(result.id).toBe('tr_001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('tr_001')
  })

  it('sets number from raw.number', () => {
    expect(result.number).toBe('TR-1042')
  })

  it('sets fromLocationId', () => {
    expect(result.fromLocationId).toBe('loc_sfo1')
  })

  it('sets toLocationId', () => {
    expect(result.toLocationId).toBe('loc_nyc1')
  })

  it('maps status "in_transit" → in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId', () => {
    expect(result.lines[0]!.productId).toBe('prod_123')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]!.quantity).toBe(50)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]!.quantityReceived).toBe(0)
  })

  it('sets shippedAt and receivedAt as ISO strings', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — status mapping', () => {
  const makeRaw = (status: string) => ({
    transferId: 'tr_x',
    fromLocationId: 'loc_1',
    toLocationId: 'loc_2',
    status,
    lines: [],
  })

  it('maps "draft" → draft', () => {
    expect(transformStockTransfer(makeRaw('draft')).status).toBe('draft')
  })

  it('maps "shipped" → in_transit', () => {
    expect(transformStockTransfer(makeRaw('shipped')).status).toBe('in_transit')
  })

  it('maps "completed" → completed', () => {
    expect(transformStockTransfer(makeRaw('completed')).status).toBe('completed')
  })

  it('maps "canceled" → cancelled', () => {
    expect(transformStockTransfer(makeRaw('canceled')).status).toBe('cancelled')
  })

  it('maps unknown → draft', () => {
    expect(transformStockTransfer(makeRaw('pending')).status).toBe('draft')
  })
})

describe('transformStockTransfer — line productId falls back to sku', () => {
  const result = transformStockTransfer({
    transferId: 'tr_2',
    fromLocationId: 'loc_1',
    toLocationId: 'loc_2',
    status: 'draft',
    lines: [{ sku: 'SKU-FB', quantity: 10 }],
  })

  it('falls back productId to sku when productId absent', () => {
    expect(result.lines[0]!.productId).toBe('SKU-FB')
  })
})
