import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawEpicorKineticTFOrdHed,
  type RawEpicorKineticTFOrdDtl,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('epicor-kinetic transformStockTransfer', () => {
  const dtlLines: RawEpicorKineticTFOrdDtl[] = [
    {
      TFLineNum: 1,
      TFOrdLine: 1,
      PartNum: 'WK-2026',
      OurStockQty: 25,
      ReceivedQty: 0,
    },
  ]

  const raw: RawEpicorKineticTFOrdHed = {
    TFOrdNum: 'TF-0001',
    FromWarehouseCode: 'WH-SRC',
    ToWarehouseCode: 'WH-DST',
    OpenOrder: true,
    RequestDate: '2024-03-01T00:00:00Z',
    NeedByDate: '2024-04-01T00:00:00Z',
    SysRowID: 'guid-tf-001',
    _lines: dtlLines,
  }

  it('maps id from TFOrdNum', () => {
    const result = transformStockTransfer(raw)
    expect(result.id).toBe('TF-0001')
    expect(result.externalId).toBe('guid-tf-001')
  })

  it('maps fromLocationId from FromWarehouseCode', () => {
    const result = transformStockTransfer(raw)
    expect(result.fromLocationId).toBe('WH-SRC')
  })

  it('maps toLocationId from ToWarehouseCode', () => {
    const result = transformStockTransfer(raw)
    expect(result.toLocationId).toBe('WH-DST')
  })

  it('maps status in_transit when OpenOrder=true', () => {
    const result = transformStockTransfer(raw)
    expect(result.status).toBe('in_transit')
  })

  it('maps status completed when OpenOrder=false', () => {
    const result = transformStockTransfer({ ...raw, OpenOrder: false })
    expect(result.status).toBe('completed')
  })

  it('maps lines from _lines', () => {
    const result = transformStockTransfer(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WK-2026')
    expect(result.lines[0]!.quantity).toBe(25)
    expect(result.lines[0]!.quantityReceived).toBe(0)
  })

  it('maps shippedAt from RequestDate', () => {
    const result = transformStockTransfer(raw)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets receivedAt only when order is closed', () => {
    const openResult = transformStockTransfer(raw)
    expect(openResult.receivedAt).toBeUndefined()

    const closedResult = transformStockTransfer({ ...raw, OpenOrder: false })
    expect(closedResult.receivedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformStockTransfer(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
