import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type SilverfinBill } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/bill'

function makeBill(overrides: Partial<SilverfinBill> = {}): SilverfinBill {
  return {
    id: '3001',
    status: 'draft',
    bill_number: 'BILL-2024-001',
    period: '2024-03-01',
    due_date: '2024-03-31',
    total_amount: 620,
    tax_amount: 120,
    currency: 'EUR',
    contact_id: '55',
    lines: [],
    ...overrides,
  }
}

describe('transformBill (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('3001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(620)
    expect(result.taxAmount).toBe(120)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as postedAt Date', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses due_date as dueAt Date', () => {
    const result = transformBill(makeBill())
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformBill(makeBill({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformBill(makeBill({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps bill lines to lineItems', () => {
    const raw = makeBill({
      lines: [
        {
          id: 20,
          description: 'Office supplies',
          quantity: 5,
          unit_price: 100,
          total_amount: 500,
          tax_amount: 120,
          account_id: '6000',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('20')
    expect(li.itemDescription).toBe('Office supplies')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(500)
    expect(li.accountId).toBe('6000')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformBill(makeBill({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
