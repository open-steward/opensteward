import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type AppFolioBill } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/bill'

function makeBill(overrides: Partial<AppFolioBill> = {}): AppFolioBill {
  return {
    id: '2001',
    bill_number: 'BILL-2024-001',
    vendor_id: '55',
    property_id: 'prop_1',
    date: '2024-03-01',
    due_date: '2024-03-31',
    amount: 1200,
    tax_amount: 0,
    currency: 'USD',
    status: 'approved',
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('2001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(1200)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill({ bill_number: 'BILL-SPECIAL' })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformBill(makeBill({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformBill(makeBill({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps voided status to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeBill({
      line_items: [
        {
          id: 20,
          description: 'Maintenance',
          quantity: 1,
          unit_price: 1200,
          amount: 1200,
          account_id: '5001',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('5001')
  })

  it('returns empty lineItems when line_items is empty', () => {
    const result = transformBill(makeBill({ line_items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
