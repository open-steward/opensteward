import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSageX3PurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/sage-x3-inventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('sage-x3-inventory transformPurchaseOrder', () => {
  const raw: RawSageX3PurchaseOrder = {
    POHNUM: 'PO-1042',
    BPSNUM: 'SUP001',
    PRHFCY: 'PARIS',
    ORDDAT: '2024-03-01T00:00:00Z',
    EXTDLVDAT: '2024-03-01T00:00:00Z',
    CUR: 'EUR',
    POHSTA: '2',
    TOTLIN: 500.0,
    AMTATI: 605.0,
    PORDERQ: [
      {
        ITMREF: 'WK-2026',
        QTYUOM: 10,
        RCPQTY: 0,
        NETPRI: 50.0,
        LINAMT: 500.0,
      },
    ],
  }

  it('maps id and number from POHNUM', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('PO-1042')
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from BPSNUM', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('SUP001')
  })

  it('maps destinationLocationId from PRHFCY', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('PARIS')
  })

  it('POHSTA "2" → status sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('POHSTA "1" → status draft', () => {
    const result = transformPurchaseOrder({ ...raw, POHSTA: '1' })
    expect(result.status).toBe('draft')
  })

  it('POHSTA "3" → status partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, POHSTA: '3' })
    expect(result.status).toBe('partially_received')
  })

  it('POHSTA "6" → status cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, POHSTA: '6' })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency from CUR', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps subtotalAmount from TOTLIN (raw decimal, not minor units)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(500.0)
  })

  it('maps lines from PORDERQ array', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].unitCost).toBe(50.0)
  })

  it('maps lines from parallel arrays when PORDERQ absent', () => {
    const { PORDERQ, ...rest } = raw
    const parallelRaw: RawSageX3PurchaseOrder = {
      ...rest,
      PORDERQ_ITMREF: ['WK-2026'],
      PORDERQ_QTYUOM: [5],
      PORDERQ_NETPRI: [50.0],
    }
    const result = transformPurchaseOrder(parallelRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('WK-2026')
    expect(result.lines[0].quantityOrdered).toBe(5)
  })

  it('platform is sage-x3-inventory', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('sage-x3-inventory')
  })

  it('produces output satisfying PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
