import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type InvoiceXpressBill } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/bill'

function makeBill(overrides: Partial<InvoiceXpressBill> = {}): InvoiceXpressBill {
  return {
    id: 200,
    status: { name: 'draft' },
    date: '2024-03-01',
    due_date: '2024-04-01',
    total: 600,
    tax_amount: 100,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('200')
    expect(result.totalAmount).toBe(600)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill({ total: 999 })
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: { name: 'draft' } })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: { name: 'sent' } })).status).toBe('AUTHORIZED')
  })

  it('maps settled to PAID', () => {
    expect(transformBill(makeBill({ status: { name: 'settled' } })).status).toBe('PAID')
  })

  it('maps canceled to VOIDED', () => {
    expect(transformBill(makeBill({ status: { name: 'canceled' } })).status).toBe('VOIDED')
  })

  it('maps second_copy to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: { name: 'second_copy' } })).status).toBe('AUTHORIZED')
  })

  it('returns undefined taxAmount when zero', () => {
    const result = transformBill(makeBill({ tax_amount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
