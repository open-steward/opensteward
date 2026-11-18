import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawLightspeedStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('lightspeed-inventory transformStockTransfer', () => {
  const raw: RawLightspeedStockTransfer = {
    id: 'con-transfer-001',
    name: 'Transfer-2024-001',
    type: 'OUTLET',
    status: 'SENT',
    source_outlet_id: 'outlet-src',
    outlet_id: 'outlet-dst',
    sent_at: '2024-03-01T00:00:00Z',
    received_at: undefined,
    products: [{ product_id: 'prod-1', count: 3 }],
    version: 2,
  }

  it('maps id and externalId from id', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('con-transfer-001')
    expect(result.externalId).toBe('con-transfer-001')
  })

  it('maps fromLocationId from source_outlet_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('outlet-src')
  })

  it('maps toLocationId from outlet_id', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('outlet-dst')
  })

  it('maps SENT status to in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps OPEN status to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 'OPEN' })
    expect(result.status).toBe('draft')
  })

  it('maps RECEIVED status to completed', () => {
    const result = transformStockTransfer({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('completed')
  })

  it('maps CANCELLED status to cancelled', () => {
    const result = transformStockTransfer({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines from products array', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-1')
    expect(result.lines[0].quantity).toBe(3)
  })

  it('maps shippedAt from sent_at', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
