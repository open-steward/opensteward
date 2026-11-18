import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawSageX3StockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('sage-x3-inventory transformStockTransfer', () => {
  const raw: RawSageX3StockTransfer = {
    VCRNUM: 'TR-001',
    SIVFCY: 'PARIS',
    RCVFCY: 'LONDON',
    VCRDAT: '2024-03-01T00:00:00Z',
    SHIDAT: '2024-03-01T00:00:00Z',
    VCRSTA: '2',
    MISRECL: [
      {
        ITMREF: 'WK-2026',
        QTYSTU: 20,
        RCPQTY: 0,
      },
    ],
  }

  it('maps id from VCRNUM', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TR-001')
  })

  it('maps fromLocationId from SIVFCY', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('PARIS')
  })

  it('maps toLocationId from RCVFCY', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('LONDON')
  })

  it('VCRSTA "2" → status in_transit', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('VCRSTA "1" → status draft', () => {
    const result = transformStockTransfer({ ...raw, VCRSTA: '1' })
    expect(result.status).toBe('draft')
  })

  it('VCRSTA "3" → status completed', () => {
    const result = transformStockTransfer({ ...raw, VCRSTA: '3' })
    expect(result.status).toBe('completed')
  })

  it('VCRSTA "9" → status cancelled', () => {
    const result = transformStockTransfer({ ...raw, VCRSTA: '9' })
    expect(result.status).toBe('cancelled')
  })

  it('maps shippedAt from SHIDAT', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back shippedAt to VCRDAT when SHIDAT absent', () => {
    const result = transformStockTransfer({ ...raw, SHIDAT: undefined })
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lines from MISRECL', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].quantity).toBe(20)
  })

  it('maps lines from parallel arrays when MISRECL absent', () => {
    const { MISRECL, ...rest } = raw
    const parallelRaw: RawSageX3StockTransfer = {
      ...rest,
      MISRECL_ITMREF: ['WK-2026'],
      MISRECL_QTYSTU: [15],
      MISRECL_RCPQTY: [15],
    }
    const result = transformStockTransfer(parallelRaw)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].quantity).toBe(15)
    expect(result.lines[0].quantityReceived).toBe(15)
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
