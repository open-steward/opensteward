import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawKoronaPosStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('korona-pos transformStockTransfer', () => {
  const raw: RawKoronaPosStockTransfer = {
    id: 'st-uuid-001',
    number: 'ST-2024-001',
    active: true,
    status: 'IN_PROGRESS',
    organizationalUnit: { id: 'ou-uuid-002', number: 'WH-002' },
    sourceOrganizationalUnit: { id: 'ou-uuid-001', number: 'WH-001' },
    arrivalDate: '2024-03-05T00:00:00Z',
    bookingTime: '2024-03-04T15:00:00Z',
    createTime: '2024-03-01T00:00:00Z',
    description: 'Replenishment transfer',
    items: [
      {
        product: { id: 'prod-uuid-001', number: 'SKU-001' },
        amount: { expected: 30, received: 0 },
        index: 1,
      },
    ],
  }

  it('maps id from raw.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('st-uuid-001')
    expect(result.externalId).toBe('st-uuid-001')
  })

  it('maps number', () => {
    const result = transformStockTransfer(raw)
    expect(result.number).toBe('ST-2024-001')
  })

  it('maps fromLocationId from sourceOrganizationalUnit.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('ou-uuid-001')
  })

  it('maps toLocationId from organizationalUnit.id', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('ou-uuid-002')
  })

  it('maps status IN_PROGRESS to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status BOOKED to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'BOOKED' })
    expect(result.status).toBe('completed')
  })

  it('defaults status to draft for unknown value', () => {
    const result = transformStockTransfer({ ...raw, status: undefined })
    expect(result.status).toBe('draft')
  })

  it('maps line items', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].quantity).toBe(30)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps shippedAt from createTime', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from bookingTime', () => {
    const result = transformStockTransfer(raw)
    expect(result.receivedAt).toBe('2024-03-04T15:00:00.000Z')
  })

  it('falls back to arrivalDate for receivedAt when bookingTime missing', () => {
    const result = transformStockTransfer({ ...raw, bookingTime: undefined })
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to korona-pos', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
