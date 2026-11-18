import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ReckonBill } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/bill'

function makeRaw(overrides: Partial<ReckonBill> = {}): ReckonBill {
  return {
    id: 'bill-001',
    billNumber: 'BILL-0001',
    date: '2024-03-05',
    dueDate: '2024-04-05',
    totalAmount: 2200,
    totalTax: 200,
    balance: 2200,
    subTotal: 2000,
    currencyCode: 'AUD',
    contactId: 'supplier-001',
    contactName: 'Supplier Pty Ltd',
    status: 'OPEN',
    lineItems: [],
    reference: 'REF-001',
    ...overrides,
  }
}

describe('transformBill (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('bill-001')
    expect(result.billNumber).toBe('BILL-0001')
    expect(result.contactId).toBe('supplier-001')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(2200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(2200)
  })

  it('maps OPEN to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'OPEN' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOID to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'VOID' })).status).toBe('VOIDED')
  })

  it('calculates paidAmount from totalAmount minus balance', () => {
    const result = transformBill(makeRaw({ totalAmount: 2200, balance: 1100 }))
    expect(result.paidAmount).toBe(1100)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
    expect(result.dueAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Parts',
          quantity: 5,
          unitAmount: 400,
          amount: 2000,
          taxAmount: 200,
          accountId: 'acc-500',
          accountName: 'Cost of Sales',
          taxCodeId: 'GST',
          discountAmount: 0,
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(2000)
    expect(result.lineItems![0].accountId).toBe('acc-500')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
