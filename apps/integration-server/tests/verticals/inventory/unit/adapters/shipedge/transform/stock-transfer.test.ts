import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawShipEdgeStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/shipedge/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('shipedge transformStockTransfer', () => {
  const raw: RawShipEdgeStockTransfer = {
    transfer_id: 'TRF-001',
    transfer_num: 'TR-2024-001',
    from_warehouse: 'WH-EAST',
    to_warehouse: 'WH-WEST',
    status: 'shipped',
    items: [
      {
        sku: 'WKB-100',
        qty: 50,
        qty_received: 48,
      },
    ],
    ship_date: '2024-03-01T00:00:00Z',
    completed_date: '2024-03-10T00:00:00Z',
  }

  it('maps transfer_id to id and externalId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TRF-001')
    expect(result.externalId).toBe('TRF-001')
  })

  it('maps transfer_num to number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('TR-2024-001')
  })

  it('maps from_warehouse to fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH-EAST')
  })

  it('maps to_warehouse to toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('WH-WEST')
  })

  it('maps "shipped" status to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps "draft" status to "draft"', () => {
    const draft: RawShipEdgeStockTransfer = { ...raw, status: 'draft' }
    expect(transformStockTransfer(draft).status).toBe('draft')
  })

  it('maps "completed" status to "completed"', () => {
    const completed: RawShipEdgeStockTransfer = { ...raw, status: 'completed' }
    expect(transformStockTransfer(completed).status).toBe('completed')
  })

  it('maps "voided" status to "cancelled"', () => {
    const voided: RawShipEdgeStockTransfer = { ...raw, status: 'voided' }
    expect(transformStockTransfer(voided).status).toBe('cancelled')
  })

  it('maps items to lines', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WKB-100')
    expect(result.lines[0].quantity).toBe(50)
    expect(result.lines[0].quantityReceived).toBe(48)
  })

  it('maps ship_date to shippedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps completed_date to receivedAt', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
