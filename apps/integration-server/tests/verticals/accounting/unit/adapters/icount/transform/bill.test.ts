import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/bill'
import type { ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'bill_200',
    doc_type: 'purchase',
    status: 'open',
    sum: 2000,
    vat_sum: 340,
    currency_code: 'ILS',
    client_id: 'sup_1',
    date: '2024-03-05',
    due_date: '2024-04-05',
    doc_number: 'BILL-200',
    ...overrides,
  }
}

describe('transformBill (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeInvoice())
    expect(result.id).toBe('bill_200')
    expect(result.billNumber).toBe('BILL-200')
    expect(result.contactId).toBe('sup_1')
    expect(result.totalAmount).toBe(2000)
    expect(result.taxAmount).toBe(340)
    expect(result.currency).toBe('ILS')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
    expect(result.dueAt).toEqual(new Date('2024-04-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status draft to DRAFT', () => {
    const result = transformBill(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status paid to PAID', () => {
    const result = transformBill(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    const result = transformBill(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeInvoice())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
