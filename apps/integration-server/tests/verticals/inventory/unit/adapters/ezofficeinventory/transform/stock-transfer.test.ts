import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawEZOStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer — ezofficeinventory', () => {
  const raw: RawEZOStockTransfer = {
    inventory_id: 10,
    id: 200,
    order_type: 'Transfer',
    is_transfer: true,
    quantity: 15,
    transfer_from_location_id: 1,
    checked_out_to_location_id: 2,
    created_at: '2024-03-01T00:00:00Z',
    user_full_name: 'Bob',
    status: 'completed',
  }
  const result = transformStockTransfer(raw)

  it('builds composite id from inventory_id and event id', () => {
    expect(result.id).toBe('10:200')
  })

  it('maps fromLocationId from transfer_from_location_id', () => {
    expect(result.fromLocationId).toBe('1')
  })

  it('maps toLocationId from checked_out_to_location_id', () => {
    expect(result.toLocationId).toBe('2')
  })

  it('maps status "completed" to "completed"', () => {
    expect(result.status).toBe('completed')
  })

  it('maps line productId from inventory_id', () => {
    expect(result.lines[0]?.productId).toBe('10')
  })

  it('maps line quantity from quantity', () => {
    expect(result.lines[0]?.quantity).toBe(15)
  })

  it('maps shippedAt from created_at', () => {
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ezofficeinventory', () => {
    expect(result.platform).toBe('ezofficeinventory')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — ezofficeinventory fallback fromLocation', () => {
  const raw: RawEZOStockTransfer = {
    inventory_id: 10,
    id: 201,
    checked_in_from_location_id: 5,
    checked_out_to_location_id: 6,
    status: 'in_transit',
  }
  const result = transformStockTransfer(raw)

  it('falls back fromLocationId to checked_in_from_location_id', () => {
    expect(result.fromLocationId).toBe('5')
  })

  it('maps status "in_transit" to "in_transit"', () => {
    expect(result.status).toBe('in_transit')
  })

  it('passes schema validation', () => {
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockTransfer — ezofficeinventory status mapping', () => {
  const base: RawEZOStockTransfer = { inventory_id: 1, id: 1 }

  it.each([
    ['in transit', 'in_transit'],
    ['in_transit', 'in_transit'],
    ['completed', 'completed'],
    ['received', 'completed'],
    ['cancelled', 'cancelled'],
    ['voided', 'cancelled'],
    ['unknown', 'completed'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformStockTransfer({ ...base, status })
    expect(result.status).toBe(expected)
  })
})
