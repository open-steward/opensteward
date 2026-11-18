import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawJubelioStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — jubelio', () => {
  const raw: RawJubelioStockTransfer = {
    transfer_id: 400,
    transfer_no: 'TRF-400',
    from_location_id: 5,
    from_location_name: 'Main Warehouse',
    to_location_id: 8,
    to_location_name: 'Branch Warehouse',
    status: 'received',
    transfer_date: '2024-03-01T00:00:00Z',
    receive_date: '2024-03-05T00:00:00Z',
    items: [
      {
        item_id: 100,
        qty: 20,
        qty_received: 20,
      },
    ],
  }
  const result = transformStockTransfer(raw)

  it('sets id from transfer_id', () => {
    expect(result.id).toBe('400')
  })

  it('sets number from transfer_no', () => {
    expect(result.number).toBe('TRF-400')
  })

  it('sets fromLocationId from from_location_id', () => {
    expect(result.fromLocationId).toBe('5')
  })

  it('sets toLocationId from to_location_id', () => {
    expect(result.toLocationId).toBe('8')
  })

  it('maps status received → completed', () => {
    expect(result.status).toBe('completed')
  })

  it('sets line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('100')
  })

  it('sets line quantity from qty', () => {
    expect(result.lines[0]?.quantity).toBe(20)
  })

  it('sets line quantityReceived from qty_received', () => {
    expect(result.lines[0]?.quantityReceived).toBe(20)
  })

  it('sets shippedAt from transfer_date', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets receivedAt from receive_date', () => {
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — status mapping', () => {
  const makeRaw = (status: string): RawJubelioStockTransfer => ({
    transfer_id: 1,
    from_location_id: 1,
    to_location_id: 2,
    status,
    items: [{ item_id: 1, qty: 1 }],
  })

  it('maps draft → draft', () => {
    expect(transformStockTransfer(makeRaw('draft')).status).toBe('draft')
  })

  it('maps transit → in_transit', () => {
    expect(transformStockTransfer(makeRaw('transit')).status).toBe('in_transit')
  })

  it('maps shipped → in_transit', () => {
    expect(transformStockTransfer(makeRaw('shipped')).status).toBe('in_transit')
  })

  it('maps completed → completed', () => {
    expect(transformStockTransfer(makeRaw('completed')).status).toBe('completed')
  })

  it('maps cancelled → cancelled', () => {
    expect(transformStockTransfer(makeRaw('cancelled')).status).toBe('cancelled')
  })
})
