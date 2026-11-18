import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/creditmemo'
import type { ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'cm_50',
    doc_type: 'creditmemo',
    status: 'open',
    sum: 300,
    vat_sum: 51,
    currency_code: 'ILS',
    client_id: 'clt_7',
    date: '2024-03-10',
    due_date: '2024-03-25',
    doc_number: 'CM-50',
    ...overrides,
  }
}

describe('transformCreditMemo (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeInvoice())
    expect(result.id).toBe('cm_50')
    expect(result.creditmemoNumber).toBe('CM-50')
    expect(result.contactId).toBe('clt_7')
    expect(result.totalAmount).toBe(300)
    expect(result.taxAmount).toBe(51)
    expect(result.currency).toBe('ILS')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
    expect(result.dueAt).toEqual(new Date('2024-03-25'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status draft to DRAFT', () => {
    const result = transformCreditMemo(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status cancelled to VOIDED', () => {
    const result = transformCreditMemo(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeInvoice())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
