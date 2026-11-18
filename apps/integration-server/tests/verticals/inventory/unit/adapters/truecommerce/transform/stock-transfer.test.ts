import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawTruecommerceStockTransfer,
  type RawTruecommerceStockTransferLine,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<RawTruecommerceStockTransferLine> = {},
): RawTruecommerceStockTransferLine {
  return {
    item_id: 'item_001',
    quantity: 50,
    qty_received: 50,
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<RawTruecommerceStockTransfer> = {},
): RawTruecommerceStockTransfer {
  return {
    transfer_id: 'tr_001',
    transfer_number: 'TR-1042',
    from_location_id: 'loc_sfo1',
    to_location_id: 'loc_nyc1',
    status: 'in_transit',
    line_items: [makeLine()],
    shipped_date: '2024-03-01T00:00:00Z',
    received_date: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

// ─── transformStockTransfer ───────────────────────────────────────────────────

describe('transformStockTransfer', () => {
  it('maps id and externalId from transfer_id', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.id).toBe('tr_001')
    expect(result.externalId).toBe('tr_001')
  })

  it('maps number from transfer_number', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.number).toBe('TR-1042')
  })

  it('maps fromLocationId from from_location_id', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.fromLocationId).toBe('loc_sfo1')
  })

  it('maps toLocationId from to_location_id', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.toLocationId).toBe('loc_nyc1')
  })

  it('defaults fromLocationId to empty string when from_location_id is absent', () => {
    const result = transformStockTransfer(makeRaw({ from_location_id: undefined }))
    expect(result.fromLocationId).toBe('')
  })

  it('defaults toLocationId to empty string when to_location_id is absent', () => {
    const result = transformStockTransfer(makeRaw({ to_location_id: undefined }))
    expect(result.toLocationId).toBe('')
  })

  it('maps line items: productId, quantity, quantityReceived', () => {
    const result = transformStockTransfer(makeRaw())
    const line = result.lines[0]
    expect(line?.productId).toBe('item_001')
    expect(line?.quantity).toBe(50)
    expect(line?.quantityReceived).toBe(50)
  })

  it('returns empty lines array when line_items is absent', () => {
    const result = transformStockTransfer(makeRaw({ line_items: undefined }))
    expect(result.lines).toEqual([])
  })

  it('maps shippedAt from shipped_date as ISO string', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from received_date as ISO string', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  describe('mapStatus', () => {
    const cases: [string, string][] = [
      ['draft', 'draft'],
      ['in_transit', 'in_transit'],
      ['in transit', 'in_transit'],
      ['shipped', 'in_transit'],
      ['completed', 'completed'],
      ['received', 'completed'],
      ['cancelled', 'cancelled'],
      ['voided', 'cancelled'],
      ['unknown_status', 'draft'], // default fallback
    ]

    for (const [rawStatus, expected] of cases) {
      it(`maps status "${rawStatus}" → "${expected}"`, () => {
        const result = transformStockTransfer(makeRaw({ status: rawStatus }))
        expect(result.status).toBe(expected)
      })
    }

    it('defaults to "draft" when status is absent', () => {
      const result = transformStockTransfer(makeRaw({ status: undefined }))
      expect(result.status).toBe('draft')
    })
  })

  it('puts raw status in metadata', () => {
    const result = transformStockTransfer(makeRaw({ status: 'in_transit' }))
    expect(result.metadata['status']).toBe('in_transit')
  })

  it('passes StockTransferSchema.parse without throwing', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
