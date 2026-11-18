import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawOracleWmsTransferOrderHdr,
} from '../../../../../../../src/verticals/inventory/adapters/oracle-wms/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('oracle-wms transformStockTransfer', () => {
  const raw: RawOracleWmsTransferOrderHdr = {
    to_hdr_id: 6001,
    transfer_num: 'TO-6001',
    from_location_id: 101,
    to_location_id: 202,
    from_facility_id: 1,
    to_facility_id: 2,
    status: 'In Transit',
    ship_date: '2024-03-01T00:00:00Z',
    complete_date: '2024-03-01T00:00:00Z',
    company_id: 1,
    transfer_order_dtl_set: [
      {
        to_dtl_id: 1,
        item_id: 5001,
        qty_transferred: 50,
        qty_received: 50,
      },
    ],
  }

  it('maps id and externalId from to_hdr_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('6001')
    expect(result.externalId).toBe('6001')
  })

  it('maps number from transfer_num', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TO-6001')
  })

  it('maps fromLocationId from from_location_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('101')
  })

  it('maps toLocationId from to_location_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('202')
  })

  it('falls back to facility IDs when location IDs absent', () => {
    const result = transformStockTransfer({
      ...raw,
      from_location_id: undefined,
      to_location_id: undefined,
    })
    expect(result.fromLocationId).toBe('1')
    expect(result.toLocationId).toBe('2')
  })

  it('maps In Transit status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps Completed status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'Completed' })
    expect(result.status).toBe('completed')
  })

  it('maps Cancelled status to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'Cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps Open status to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'Open' })
    expect(result.status).toBe('draft')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('5001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt from ship_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from complete_date', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to oracle-wms', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('oracle-wms')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
