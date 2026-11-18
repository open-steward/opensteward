import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ClearBooksBill } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/bill'

function makeBill(overrides: Partial<ClearBooksBill> = {}): ClearBooksBill {
  return {
    bill_id: '2001',
    bill_number: 'BILL-2024-001',
    entity_id: '55',
    date_created: '01/03/2024',
    date_due: '31/03/2024',
    total_gross: 600,
    total_net: 500,
    total_tax: 100,
    currency: 'GBP',
    status: 'unpaid',
    line_items: [],
    ...overrides,
  }
}

describe('transformBill (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('2001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(600)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill({ bill_number: 'BILL-SPECIAL' })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps unpaid status to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'unpaid' }))
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

  it('maps void status to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeBill({
      line_items: [
        {
          id: 20,
          description: 'Office Supplies',
          quantity: 5,
          unit_price: 100,
          total_net: 500,
          tax_amount: 100,
          account_code: '5000',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('20')
    expect(li.totalAmount).toBe(500)
    expect(li.taxAmount).toBe(100)
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
