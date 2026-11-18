import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawJushuitanStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('jushuitan transformStockTransfer', () => {
  // This is a stub transform — Jushuitan does not implement stock transfers.
  const raw: RawJushuitanStockTransfer = {}

  it('returns empty id strings (stub)', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('')
    expect(result.fromLocationId).toBe('')
    expect(result.toLocationId).toBe('')
  })

  it('returns status draft (stub)', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('draft')
  })

  it('returns empty lines array (stub)', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toEqual([])
  })

  it('sets platform to jushuitan', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() => StockTransferSchema.parse(transformStockTransfer(raw))).not.toThrow()
  })
})
