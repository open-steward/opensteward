import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawVersaStockTransfer,
  type RawVersaTransferLine,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

const baseLines: RawVersaTransferLine[] = [
  { item_id: 'item-001', quantity: 30, quantity_received: 30 },
]

const baseRaw: RawVersaStockTransfer = {
  id: 'tr-001',
  transfer_number: 'TR-2024-001',
  from_location_id: 'loc-001',
  to_location_id: 'loc-002',
  status: 'in transit',
  transfer_lines: baseLines,
  ship_date: '2024-03-01T00:00:00Z',
  completed_date: '2024-03-05T00:00:00Z',
}

describe('versa-cloud-erp transformStockTransfer', () => {
  it('maps id from id field', () => {
    expect(transformStockTransfer(baseRaw).id).toBe('tr-001')
  })

  it('maps number from transfer_number', () => {
    expect(transformStockTransfer(baseRaw).number).toBe('TR-2024-001')
  })

  it('maps fromLocationId from from_location_id', () => {
    expect(transformStockTransfer(baseRaw).fromLocationId).toBe('loc-001')
  })

  it('maps toLocationId from to_location_id', () => {
    expect(transformStockTransfer(baseRaw).toLocationId).toBe('loc-002')
  })

  it('maps status "in transit" to in_transit', () => {
    expect(transformStockTransfer(baseRaw).status).toBe('in_transit')
  })

  it('maps status draft to draft', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'draft' }).status).toBe('draft')
  })

  it('maps status completed to completed', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'completed' }).status).toBe('completed')
  })

  it('maps status cancelled to cancelled', () => {
    expect(transformStockTransfer({ ...baseRaw, status: 'cancelled' }).status).toBe('cancelled')
  })

  it('maps lines with productId and quantity', () => {
    const result = transformStockTransfer(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('item-001')
    expect(result.lines[0]!.quantity).toBe(30)
    expect(result.lines[0]!.quantityReceived).toBe(30)
  })

  it('also accepts lines key instead of transfer_lines', () => {
    const raw: RawVersaStockTransfer = { ...baseRaw, transfer_lines: undefined, lines: baseLines }
    expect(transformStockTransfer(raw).lines).toHaveLength(1)
  })

  it('maps shippedAt from ship_date', () => {
    expect(transformStockTransfer(baseRaw).shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to shipped_date when ship_date absent', () => {
    const result = transformStockTransfer({
      ...baseRaw,
      ship_date: undefined,
      shipped_date: '2024-03-02T00:00:00Z',
    })
    expect(result.shippedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('maps receivedAt from completed_date', () => {
    expect(transformStockTransfer(baseRaw).receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformStockTransfer(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(baseRaw))).not.toThrow()
  })
})
