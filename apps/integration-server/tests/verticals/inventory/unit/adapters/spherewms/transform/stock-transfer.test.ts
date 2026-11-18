import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSphereWmsTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — spherewms', () => {
  const raw: RawSphereWmsTransfer = {
    transfer_id: 'TRN-001',
    transfer_number: 'TR-1042',
    from_location_id: 'LOC-001',
    to_location_id: 'LOC-002',
    status: 'in transit',
    client_code: 'CLIENT-1',
    created_on: '2024-03-01T00:00:00Z',
    shipped_on: '2024-03-01T00:00:00Z',
    completed_on: '2024-03-01T00:00:00Z',
    items: [
      {
        product_id: 'PROD-42',
        quantity: 50,
        received_qty: 50,
      },
    ],
  }
  const result = transformStockTransfer(raw)

  it('maps id from transfer_id', () => {
    expect(result.id).toBe('TRN-001')
  })

  it('maps number from transfer_number', () => {
    expect(result.number).toBe('TR-1042')
  })

  it('maps fromLocationId from from_location_id', () => {
    expect(result.fromLocationId).toBe('LOC-001')
  })

  it('maps toLocationId from to_location_id', () => {
    expect(result.toLocationId).toBe('LOC-002')
  })

  it('maps status "in transit" to in_transit', () => {
    expect(result.status).toBe('in_transit')
  })

  it('maps line productId from product_id', () => {
    expect(result.lines[0]?.productId).toBe('PROD-42')
  })

  it('maps line quantity', () => {
    expect(result.lines[0]?.quantity).toBe(50)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(50)
  })

  it('maps shippedAt from shipped_on', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from completed_on', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — spherewms status mapping', () => {
  const base: RawSphereWmsTransfer = {
    transfer_id: 'T1',
    from_location_id: 'L1',
    to_location_id: 'L2',
  }

  it.each([
    ['cancelled', 'cancelled'],
    ['void', 'cancelled'],
    ['complete', 'completed'],
    ['received', 'completed'],
    ['ship', 'in_transit'],
    ['unknown_status', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformStockTransfer({ ...base, status })
    expect(result.status).toBe(expected)
  })
})
