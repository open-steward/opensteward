import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type AvidXchangeInvoice,
  type AvidXchangeLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/avidxchange/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<AvidXchangeInvoice> = {}): AvidXchangeInvoice {
  return {
    invoiceId: 'INV-001',
    invoiceNumber: 'BILL-2024-001',
    vendorId: 'VND-001',
    companyId: 'CO-001',
    status: 'APPROVED',
    invoiceDate: '2024-01-15T00:00:00.000Z',
    dueDate: '2024-02-14T00:00:00.000Z',
    totalAmount: 5000,
    taxAmount: 400,
    amountDue: 5000,
    amountPaid: 0,
    currency: 'USD',
    description: 'Office supplies invoice',
    lineItems: [],
    createdDate: '2024-01-10T00:00:00.000Z',
    modifiedDate: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

const sampleLineItems: AvidXchangeLineItem[] = [
  {
    lineItemId: 'LI-001',
    glAccountId: 'gl-office',
    description: 'Paper reams',
    quantity: 10,
    unitPrice: 400,
    amount: 4000,
    taxAmount: 320,
  },
]

describe('transformBill (avidxchange)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('INV-001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('VND-001')
    expect(result.currency).toBe('USD')
    // AvidXchange passes amounts directly (no minor-unit conversion)
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(400)
    expect(result.balanceAmount).toBe(5000)
    expect(result.notes).toBe('Office supplies invoice')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15T00:00:00.000Z'))
    expect(result.dueAt).toEqual(new Date('2024-02-14T00:00:00.000Z'))
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'APPROVED' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    const result = transformBill(makeRaw({ status: 'PAID' }))
    expect(result.status).toBe('PAID')
  })

  it('maps VOIDED status to VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'VOIDED' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps PARTIAL status to PARTIALLY_PAID', () => {
    const result = transformBill(makeRaw({ status: 'PARTIAL' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps SUBMITTED status to SUBMITTED', () => {
    const result = transformBill(makeRaw({ status: 'SUBMITTED' }))
    expect(result.status).toBe('SUBMITTED')
  })

  it('maps OVERDUE status to OVERDUE', () => {
    const result = transformBill(makeRaw({ status: 'OVERDUE' }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps DRAFT status to DRAFT', () => {
    const result = transformBill(makeRaw({ status: 'DRAFT' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformBill(makeRaw({ lineItems: sampleLineItems }))
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('LI-001')
    expect(li.accountId).toBe('gl-office')
    expect(li.itemDescription).toBe('Paper reams')
    expect(li.unitAmount).toBe(400)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(4000)
    expect(li.taxAmount).toBe(320)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeRaw({ lineItems: sampleLineItems }))
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
