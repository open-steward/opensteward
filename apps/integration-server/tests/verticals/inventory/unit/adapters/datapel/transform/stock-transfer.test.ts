import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawDatapelTransferOrder,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('datapel transformStockTransfer', () => {
  const raw: RawDatapelTransferOrder = {
    transferid: 500,
    transfernumber: 'TR-500',
    fromlocationid: 42,
    tolocationid: 43,
    fromlocationname: 'Sydney Warehouse',
    tolocationname: 'Melbourne Warehouse',
    status: 'in transit',
    shipdate: '2024-03-01T00:00:00Z',
    receiveddate: '2024-03-05T00:00:00Z',
    lines: [
      {
        basestockid: 101,
        itemcode: 'WIDGET-001',
        qty: 20,
        receivedqty: 20,
      },
    ],
  }

  it('maps id and externalId from transferid', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps number from transfernumber', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-500')
  })

  it('maps fromLocationId from fromlocationid', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('42')
  })

  it('maps toLocationId from tolocationid', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('43')
  })

  it('maps status "in transit" to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status draft to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps status received to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'received' })
    expect(result.status).toBe('completed')
  })

  it('maps status cancelled to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines using qty field', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('101')
    expect(result.lines[0].quantity).toBe(20)
    expect(result.lines[0].quantityReceived).toBe(20)
  })

  it('falls back to transferqty when qty absent', () => {
    const result = transformStockTransfer({
      ...raw,
      lines: [{ basestockid: 101, transferqty: 15 }],
    })
    expect(result.lines[0].quantity).toBe(15)
  })

  it('maps shippedAt from shipdate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receiveddate', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to datapel', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
