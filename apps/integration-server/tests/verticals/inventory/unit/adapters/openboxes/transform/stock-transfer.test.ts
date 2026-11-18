import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawOpenboxesStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('openboxes transformStockTransfer', () => {
  const raw: RawOpenboxesStockTransfer = {
    id: 'sm-out-001',
    identifier: 'SM-OUT-2024-001',
    name: 'Transfer to Zone B',
    status: 'SHIPPED',
    statusCode: 'SHIPPED',
    origin: { id: 'loc-001', name: 'Zone A' },
    destination: { id: 'loc-002', name: 'Zone B' },
    dateShipped: '2024-03-01T00:00:00Z',
    dateDelivered: '2024-03-01T00:00:00Z',
    lineItems: [
      {
        id: 'li-001',
        product: { id: 'prod-001', productCode: 'WK-2026', name: 'Wireless Keyboard' },
        quantityRequested: 50,
        quantityAllowed: 50,
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('sm-out-001')
    expect(result.externalId).toBe('sm-out-001')
  })

  it('maps number from identifier', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('SM-OUT-2024-001')
  })

  it('maps fromLocationId from origin.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('loc-001')
  })

  it('maps toLocationId from destination.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('loc-002')
  })

  it('maps SHIPPED statusCode to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps RECEIVED statusCode to completed', () => {
    const result = transformStockTransfer({ ...raw, statusCode: 'RECEIVED' })
    expect(result.status).toBe('completed')
  })

  it('maps CANCELLED statusCode to cancelled', () => {
    const result = transformStockTransfer({ ...raw, statusCode: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt from dateShipped', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from dateDelivered', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openboxes', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
