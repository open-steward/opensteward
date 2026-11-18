import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawTexadaStockTransfer,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('transformStockTransfer', () => {
  const base: RawTexadaStockTransfer = {
    transferId: 'TRF-001',
    transferNo: 'TR-2024-001',
    fromBranchId: 'branch-001',
    toBranchId: 'branch-002',
    status: 'SHIPPED',
    shipDate: '2024-03-01T00:00:00Z',
    receivedDate: '2024-03-05T00:00:00Z',
    lines: [
      {
        itemNo: 'ITEM-001',
        quantity: 10,
        quantityReceived: 10,
      },
    ],
  }

  it('maps transferId → id and externalId', () => {
    const result = transformStockTransfer(base)
    expect(result.id).toBe('TRF-001')
    expect(result.externalId).toBe('TRF-001')
  })

  it('maps transferNo → number', () => {
    const result = transformStockTransfer(base)
    expect(result.number).toBe('TR-2024-001')
  })

  it('maps fromBranchId → fromLocationId', () => {
    const result = transformStockTransfer(base)
    expect(result.fromLocationId).toBe('branch-001')
  })

  it('maps toBranchId → toLocationId', () => {
    const result = transformStockTransfer(base)
    expect(result.toLocationId).toBe('branch-002')
  })

  it('maps SHIPPED status → "in_transit"', () => {
    const result = transformStockTransfer(base)
    expect(result.status).toBe('in_transit')
  })

  it('maps DRAFT status → "draft"', () => {
    const result = transformStockTransfer({ ...base, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps PENDING status → "draft"', () => {
    const result = transformStockTransfer({ ...base, status: 'PENDING' })
    expect(result.status).toBe('draft')
  })

  it('maps NEW status → "draft"', () => {
    const result = transformStockTransfer({ ...base, status: 'NEW' })
    expect(result.status).toBe('draft')
  })

  it('maps IN TRANSIT status → "in_transit"', () => {
    const result = transformStockTransfer({ ...base, status: 'IN TRANSIT' })
    expect(result.status).toBe('in_transit')
  })

  it('maps INTRANSIT status → "in_transit"', () => {
    const result = transformStockTransfer({ ...base, status: 'INTRANSIT' })
    expect(result.status).toBe('in_transit')
  })

  it('maps SENT status → "in_transit"', () => {
    const result = transformStockTransfer({ ...base, status: 'SENT' })
    expect(result.status).toBe('in_transit')
  })

  it('maps COMPLETED status → "completed"', () => {
    const result = transformStockTransfer({ ...base, status: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps RECEIVED status → "completed"', () => {
    const result = transformStockTransfer({ ...base, status: 'RECEIVED' })
    expect(result.status).toBe('completed')
  })

  it('maps CLOSED status → "completed"', () => {
    const result = transformStockTransfer({ ...base, status: 'CLOSED' })
    expect(result.status).toBe('completed')
  })

  it('maps VOIDED status → "cancelled"', () => {
    const result = transformStockTransfer({ ...base, status: 'VOIDED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps CANCELLED status → "cancelled"', () => {
    const result = transformStockTransfer({ ...base, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('defaults unknown status → "draft"', () => {
    const result = transformStockTransfer({ ...base, status: 'MYSTERY_STATUS' })
    expect(result.status).toBe('draft')
  })

  it('maps shipDate → shippedAt as ISO string', () => {
    const result = transformStockTransfer(base)
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedDate → receivedAt as ISO string', () => {
    const result = transformStockTransfer(base)
    expect(result.receivedAt).toBe('2024-03-05T00:00:00.000Z')
  })

  it('falls back transferDate → shippedAt when shipDate is absent', () => {
    const { shipDate, ...rest } = base
    const result = transformStockTransfer({ ...rest, transferDate: '2024-03-02T00:00:00Z' })
    expect(result.shippedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('falls back completedDate → receivedAt when receivedDate is absent', () => {
    const { receivedDate, ...rest } = base
    const result = transformStockTransfer({ ...rest, completedDate: '2024-03-06T00:00:00Z' })
    expect(result.receivedAt).toBe('2024-03-06T00:00:00.000Z')
  })

  it('falls back id → id when transferId is absent', () => {
    const { transferId, ...rest } = base
    const result = transformStockTransfer({ ...rest, id: 'TRF-FALLBACK' })
    expect(result.id).toBe('TRF-FALLBACK')
  })

  it('falls back number → number when transferNo is absent', () => {
    const { transferNo, ...rest } = base
    const result = transformStockTransfer({ ...rest, number: 'ALT-TR-001' })
    expect(result.number).toBe('ALT-TR-001')
  })

  it('falls back fromBranchNo → fromLocationId when fromBranchId is absent', () => {
    const { fromBranchId, ...rest } = base
    const result = transformStockTransfer({ ...rest, fromBranchNo: 'BN-FROM' })
    expect(result.fromLocationId).toBe('BN-FROM')
  })

  it('falls back toBranchNo → toLocationId when toBranchId is absent', () => {
    const { toBranchId, ...rest } = base
    const result = transformStockTransfer({ ...rest, toBranchNo: 'BN-TO' })
    expect(result.toLocationId).toBe('BN-TO')
  })

  it('falls back transferStatus → status when status is absent', () => {
    const { status, ...rest } = base
    const result = transformStockTransfer({ ...rest, transferStatus: 'COMPLETED' })
    expect(result.status).toBe('completed')
  })

  it('maps line itemNo → productId', () => {
    const result = transformStockTransfer(base)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
  })

  it('maps line quantity → quantity', () => {
    const result = transformStockTransfer(base)
    expect(result.lines[0]!.quantity).toBe(10)
  })

  it('maps line quantityReceived → quantityReceived', () => {
    const result = transformStockTransfer(base)
    expect(result.lines[0]!.quantityReceived).toBe(10)
  })

  it('falls back quantityTransferred → quantity when quantity is absent', () => {
    const result = transformStockTransfer({
      ...base,
      lines: [{ itemNo: 'ITEM-002', quantityTransferred: 7 }],
    })
    expect(result.lines[0]!.quantity).toBe(7)
  })

  it('falls back received → quantityReceived when quantityReceived is absent', () => {
    const result = transformStockTransfer({
      ...base,
      lines: [{ itemNo: 'ITEM-002', quantity: 5, received: 4 }],
    })
    expect(result.lines[0]!.quantityReceived).toBe(4)
  })

  it('yields empty lines array when lines are absent', () => {
    const { lines, ...rest } = base
    const result = transformStockTransfer(rest)
    expect(result.lines).toEqual([])
  })

  it('sets platform to "texada"', () => {
    const result = transformStockTransfer(base)
    expect(result.platform).toBe('texada')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(base)
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})
