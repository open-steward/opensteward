import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSpsCommerceStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — sps-commerce', () => {
  const raw: RawSpsCommerceStockTransfer = {
    transfer_id: 'TR-SPS-001',
    transfer_number: 'TRN-1042',
    from_location_id: 'LOC-001',
    to_location_id: 'LOC-002',
    status: 'in_transit',
    ship_date: '2024-03-01T00:00:00Z',
    receive_date: '2024-03-01T00:00:00Z',
    lines: [
      {
        item_id: 'SPS-ITEM-01',
        quantity: 50,
        quantity_received: 50,
      },
    ],
  }
  const result = transformStockTransfer(raw)

  it('maps id from transfer_id', () => {
    expect(result.id).toBe('TR-SPS-001')
  })

  it('maps number from transfer_number', () => {
    expect(result.number).toBe('TRN-1042')
  })

  it('maps fromLocationId from from_location_id', () => {
    expect(result.fromLocationId).toBe('LOC-001')
  })

  it('maps toLocationId from to_location_id', () => {
    expect(result.toLocationId).toBe('LOC-002')
  })

  it('maps status in_transit to in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from item_id', () => {
    expect(result.lines[0]?.productId).toBe('SPS-ITEM-01')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]?.quantity).toBe(50)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(50)
  })

  it('maps shippedAt from ship_date', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from receive_date', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — sps-commerce status mapping', () => {
  const base: RawSpsCommerceStockTransfer = {
    transfer_id: 'T1',
    from_location_id: 'L1',
    to_location_id: 'L2',
  }

  it.each([
    ['draft', 'draft'],
    ['shipped', 'in_transit'],
    ['in transit', 'in_transit'],
    ['completed', 'completed'],
    ['received', 'completed'],
    ['cancelled', 'cancelled'],
    ['voided', 'cancelled'],
    ['unknown', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformStockTransfer({ ...base, status })
    expect(result.status).toBe(expected)
  })
})

describe('transformStockTransfer — sps-commerce location string fallback', () => {
  const raw: RawSpsCommerceStockTransfer = {
    transfer_id: 'T-FB',
    from_location: 'WH-A',
    to_location: 'WH-B',
    status: 'completed',
  }
  const result = transformStockTransfer(raw)

  it('falls back fromLocationId to from_location string', () => {
    expect(result.fromLocationId).toBe('WH-A')
  })

  it('falls back toLocationId to to_location string', () => {
    expect(result.toLocationId).toBe('WH-B')
  })
})
