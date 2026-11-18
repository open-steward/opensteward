import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type FreeeBill } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/bill'

function makeRaw(overrides: Partial<FreeeBill> = {}): FreeeBill {
  return {
    id: 2001,
    issue_date: '2024-04-01',
    due_date: '2024-04-30',
    amount: 5000,
    total_amount: 5500,
    status: 'draft',
    partner_id: 10,
    partner_name: 'Supplier Inc',
    details: [],
    ...overrides,
  }
}

describe('transformBill (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeRaw())
    expect(result.id).toBe('2001')
    expect(result.contactId).toBe('10')
    expect(result.totalAmount).toBe(5500)
    expect(result.balanceAmount).toBe(5000)
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-30'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformBill(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps under_review status to AUTHORIZED', () => {
    const result = transformBill(makeRaw({ status: 'under_review' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformBill(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps rejected status to VOIDED', () => {
    const result = transformBill(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps details to lineItems', () => {
    const raw = makeRaw({
      details: [
        {
          id: 1,
          item_name: 'Office Supplies',
          quantity: 3,
          unit_price: 1000,
          amount: 3000,
          tax_category: 'tax_10',
          account_item_id: 200,
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Office Supplies')
    expect(li.totalAmount).toBe(3000)
    expect(li.accountId).toBe('200')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeRaw())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
