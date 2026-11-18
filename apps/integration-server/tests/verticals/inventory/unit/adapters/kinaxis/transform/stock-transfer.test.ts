import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawKinaxisTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/kinaxis/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('kinaxis transformStockTransfer', () => {
  const raw: RawKinaxisTransfer = {
    id: 'xfer-uuid-001',
    transferNumber: 'TRF-2024-001',
    fromSiteId: 'site-uuid-001',
    toSiteId: 'site-uuid-002',
    status: 'InTransit',
    lines: [
      {
        partId: 'part-uuid-001',
        quantity: 10,
        receivedQty: 0,
      },
    ],
    shipDate: '2024-03-01T00:00:00Z',
    receiptDate: '2024-03-05T00:00:00Z',
  }

  it('maps id from raw.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('xfer-uuid-001')
    expect(result.externalId).toBe('xfer-uuid-001')
  })

  it('maps number from transferNumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TRF-2024-001')
  })

  it('maps fromLocationId from fromSiteId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('site-uuid-001')
  })

  it('maps toLocationId from toSiteId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('site-uuid-002')
  })

  it('maps status InTransit to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status Received to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'Received' })
    expect(result.status).toBe('completed')
  })

  it('maps status Cancelled to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('part-uuid-001')
    expect(result.lines[0].quantity).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from shipDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receiptDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to kinaxis', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('kinaxis')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
