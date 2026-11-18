import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawEpicorKineticPOHeader,
  type RawEpicorKineticPODetail,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('epicor-kinetic transformPurchaseOrder', () => {
  const lines: RawEpicorKineticPODetail[] = [
    {
      PONum: 1001,
      POLine: 1,
      PartNum: 'WK-2026',
      XOrderQty: 50,
      ReceivedQty: 10,
      DocUnitCost: 25.0,
      DocExtCost: 1250.0,
      WarehouseCode: 'WH-MAIN',
    },
  ]

  const raw: RawEpicorKineticPOHeader = {
    PONum: 1001,
    VendorNum: 42,
    VendorID: 'VENDOR-A',
    OrderDate: '2024-03-01T00:00:00Z',
    DueDate: '2024-04-01T00:00:00Z',
    CurrencyCode: 'USD',
    DocTotalOrder: 1250.0,
    OpenPO: true,
    ApprovalStatus: 'A',
    EntryPerson: 'jdoe',
    SysRowID: 'guid-po-001',
    _lines: lines,
  }

  it('maps id from PONum', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('1001')
    expect(result.number).toBe('1001')
  })

  it('maps externalId from SysRowID', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.externalId).toBe('guid-po-001')
  })

  it('maps supplierId from VendorNum', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('42')
  })

  it('maps status sent when OpenPO=true and ApprovalStatus=A', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status draft when ApprovalStatus=U', () => {
    const result = transformPurchaseOrder({ ...raw, ApprovalStatus: 'U' })
    expect(result.status).toBe('draft')
  })

  it('maps status closed when OpenPO=false', () => {
    const result = transformPurchaseOrder({ ...raw, OpenPO: false })
    expect(result.status).toBe('closed')
  })

  it('maps currency from CurrencyCode', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from DocTotalOrder', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(1250.0)
  })

  it('maps lines from _lines', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WK-2026')
    expect(result.lines[0]!.quantityOrdered).toBe(50)
    expect(result.lines[0]!.quantityReceived).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(25.0)
  })

  it('maps orderedAt from OrderDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from DueDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-04-01T00:00:00.000Z')
  })

  it('handles empty _lines gracefully', () => {
    const result = transformPurchaseOrder({ ...raw, _lines: undefined })
    expect(result.lines).toHaveLength(0)
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
