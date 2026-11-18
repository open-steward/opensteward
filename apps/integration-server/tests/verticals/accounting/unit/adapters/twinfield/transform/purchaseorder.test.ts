import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type TwinfieldPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<TwinfieldPurchaseOrder> = {}): TwinfieldPurchaseOrder {
  return {
    code: 'PO-001',
    orderNumber: '2024PO001',
    supplier: 'SUPP001',
    currency: 'EUR',
    orderDate: '2024-01-15',
    status: 'active',
    totalExcl: 500,
    totalIncl: 605,
    vatTotal: 105,
    lines: [],
    office: 'main',
    ...overrides,
  }
}

describe('transformPurchaseOrder (twinfield)', () => {
  it('maps code to id', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).id).toBe('PO-001')
  })

  it('maps supplier to contactId', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).contactId).toBe('SUPP001')
  })

  it('maps totalIncl to totalAmount', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).totalAmount).toBe(605)
  })

  it('maps currency', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).currency).toBe('EUR')
  })

  it('maps orderDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps status final to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'final' })).status).toBe('COMPLETED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status received to COMPLETED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'received' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status voided to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'voided' })).status).toBe('CANCELLED')
  })

  it('maps status deleted to CANCELLED', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'deleted' })).status).toBe('CANCELLED')
  })

  it('maps status concept to DRAFT', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'concept' })).status).toBe('DRAFT')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps lines to lineItems', () => {
    const raw = makePurchaseOrder({
      lines: [
        {
          id: 'line-po-1',
          article: 'MAT-001',
          description: 'Steel',
          quantity: 10,
          unitsPriceExcl: 50,
          valueExcl: 500,
          valueInc: 605,
          vatCode: 'VH',
          vatValue: 105,
          dim1: 'acc-7000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('line-po-1')
    expect(li.itemId).toBe('MAT-001')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(605)
    expect(li.taxAmount).toBe(105)
    expect(li.accountId).toBe('acc-7000')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
