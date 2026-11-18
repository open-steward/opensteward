import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  groupTransferRows,
  type RawSysproStockTransfer,
  type RawSysproTransferRow,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

function makeRaw(overrides: Partial<RawSysproStockTransfer> = {}): RawSysproStockTransfer {
  return {
    id: 'TRF-999',
    fromWarehouse: 'WH01',
    toWarehouse: 'WH02',
    transactionDate: '2024-03-01T00:00:00Z',
    reference: 'Monthly replenishment',
    lines: [{ stockCode: 'WIDGET-RED', qty: 50 }],
    ...overrides,
  }
}

describe('transformStockTransfer (syspro)', () => {
  it('maps id and externalId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.id).toBe('TRF-999')
    expect(result.externalId).toBe('TRF-999')
    expect(result.number).toBe('TRF-999')
  })

  it('maps fromLocationId and toLocationId', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.fromLocationId).toBe('WH01')
    expect(result.toLocationId).toBe('WH02')
  })

  it('status is always "completed" for posted SYSPRO movements', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.status).toBe('completed')
  })

  it('maps line items: productId, quantity, and quantityReceived (= qty for posted)', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WIDGET-RED')
    expect(result.lines[0]!.quantity).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(50)
  })

  it('maps shippedAt and receivedAt from transactionDate', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "syspro"', () => {
    const result = transformStockTransfer(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes StockTransferSchema validation', () => {
    const result = transformStockTransfer(makeRaw())
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

describe('groupTransferRows (syspro)', () => {
  function makeNegRow(overrides: Partial<RawSysproTransferRow> = {}): RawSysproTransferRow {
    return {
      Journal: 'J100',
      SourceJournal: 'TRF-999',
      Warehouse: 'WH01',
      StockCode: 'WIDGET-RED',
      MovementQty: -50,
      MovementType: 'TRF',
      TransactionDate: '2024-03-01T00:00:00Z',
      ...overrides,
    }
  }

  function makePosRow(overrides: Partial<RawSysproTransferRow> = {}): RawSysproTransferRow {
    return {
      Journal: 'J101',
      SourceJournal: 'TRF-999',
      Warehouse: 'WH02',
      StockCode: 'WIDGET-RED',
      MovementQty: 50,
      MovementType: 'TRF',
      TransactionDate: '2024-03-01T00:00:00Z',
      ...overrides,
    }
  }

  it('groups negative and positive legs into one transfer', () => {
    const transfers = groupTransferRows([makeNegRow(), makePosRow()])
    expect(transfers).toHaveLength(1)
    expect(transfers[0]!.fromWarehouse).toBe('WH01')
    expect(transfers[0]!.toWarehouse).toBe('WH02')
  })

  it('collects lines for each StockCode', () => {
    const transfers = groupTransferRows([makeNegRow(), makePosRow()])
    expect(transfers[0]!.lines).toHaveLength(1)
    expect(transfers[0]!.lines[0]!.stockCode).toBe('WIDGET-RED')
    expect(transfers[0]!.lines[0]!.qty).toBe(50)
  })

  it('returns empty array for empty input', () => {
    expect(groupTransferRows([])).toEqual([])
  })
})
