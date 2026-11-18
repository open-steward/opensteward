import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSkulabsTransferOrder,
} from '../../../../../../../src/verticals/inventory/adapters/skulabs/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('skulabs transformStockTransfer', () => {
  const raw: RawSkulabsTransferOrder = {
    _id: 'to-001',
    number: 1042,
    name: 'Transfer to West',
    source_warehouse_id: 'wh-east',
    destination_warehouse_id: 'wh-west',
    status: 'transit',
    notes: 'Urgent restocking',
    items: [
      {
        _id: 'line-001',
        item_id: 'item-abc',
        quantity: 50,
        deducted_quantity: 50,
        transferred_quantity: 48,
        source_location_id: 'loc-east-bin1',
        destination_location_id: 'loc-west-bin2',
      },
    ],
    log: [
      { action: 'transit started', time: '2024-03-01T00:00:00Z' },
      { action: 'closed and completed', time: '2024-03-10T00:00:00Z' },
    ],
  }

  it('maps _id to id and externalId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('to-001')
    expect(result.externalId).toBe('to-001')
  })

  it('maps numeric number to string number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('1042')
  })

  it('maps source_warehouse_id to fromLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('wh-east')
  })

  it('maps destination_warehouse_id to toLocationId', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('wh-west')
  })

  it('maps "transit" status to "in_transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps "created" status to "draft"', () => {
    const draft: RawSkulabsTransferOrder = { ...raw, status: 'created' }
    expect(transformStockTransfer(draft).status).toBe('draft')
  })

  it('maps "closed" status to "completed"', () => {
    const closed: RawSkulabsTransferOrder = { ...raw, status: 'closed' }
    expect(transformStockTransfer(closed).status).toBe('completed')
  })

  it('maps "processing" status to "in_transit"', () => {
    const processing: RawSkulabsTransferOrder = { ...raw, status: 'processing' }
    expect(transformStockTransfer(processing).status).toBe('in_transit')
  })

  it('maps items to lines', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('item-abc')
    expect(result.lines[0].quantity).toBe(50)
    expect(result.lines[0].quantityReceived).toBe(48)
  })

  it('derives shippedAt from log entry containing "transit"', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('derives receivedAt from log entry containing "close"', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('returns undefined shippedAt when no matching log entry', () => {
    const noLog: RawSkulabsTransferOrder = { ...raw, log: [] }
    expect(transformStockTransfer(noLog).shippedAt).toBeUndefined()
  })

  it('satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
