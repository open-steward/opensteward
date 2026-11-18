import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type MriPurchaseOrder,
  type MriPurchaseOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

const sampleLine: MriPurchaseOrderLine = {
  id: 'pol-001',
  description: 'Server hardware',
  accountId: 'acct-001',
  unitAmount: 100000,
  quantity: 2,
  totalAmount: 200000,
}

function makeRaw(overrides: Partial<MriPurchaseOrder> = {}): MriPurchaseOrder {
  return {
    id: 'po-001',
    orderNumber: 'PO-2024-001',
    vendorId: 'vend-001',
    currencyCode: 'USD',
    status: 'OPEN',
    totalAmount: 200000,
    orderDate: '2024-04-01T00:00:00.000Z',
    deliveryDate: '2024-04-15T00:00:00.000Z',
    lines: [sampleLine],
    createdAt: '2024-04-01T08:00:00.000Z',
    updatedAt: '2024-04-02T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformPurchaseOrder (mri-software)', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('po-001')
  })

  it('maps vendorId to contactId', () => {
    expect(transformPurchaseOrder(makeRaw()).contactId).toBe('vend-001')
  })

  it('maps currencyCode to currency', () => {
    expect(transformPurchaseOrder(makeRaw()).currency).toBe('USD')
  })

  it('maps OPEN status to ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'OPEN' })).status).toBe('ACTIVE')
  })

  it('maps COMPLETED status to COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'COMPLETED' })).status).toBe('COMPLETED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'UNKNOWN' })).status).toBe('DRAFT')
  })

  it('maps totalAmount', () => {
    expect(transformPurchaseOrder(makeRaw()).totalAmount).toBe(200000)
  })

  it('maps orderDate to postedAt', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('maps lineitem description', () => {
    expect(transformPurchaseOrder(makeRaw()).lineItems![0].itemDescription).toBe('Server hardware')
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makeRaw()))).not.toThrow()
  })
})
