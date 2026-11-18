import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type InvoiceXpressCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/creditmemo'

function makeCreditMemo(overrides: Partial<InvoiceXpressCreditMemo> = {}): InvoiceXpressCreditMemo {
  return {
    id: 300,
    status: { name: 'draft' },
    sequence_number: 'NC 2024/1',
    date: '2024-06-01',
    due_date: '2024-07-01',
    total: 200,
    tax_amount: 40,
    currency: 'EUR',
    client: { id: 77 },
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('300')
    expect(result.creditmemoNumber).toBe('NC 2024/1')
    expect(result.contactId).toBe('77')
    expect(result.totalAmount).toBe(200)
    expect(result.taxAmount).toBe(40)
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
    expect(result.dueAt).toEqual(new Date('2024-07-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo({ total: 999 })
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft to DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: { name: 'draft' } })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: { name: 'sent' } })).status).toBe('AUTHORIZED')
  })

  it('maps settled to PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: { name: 'settled' } })).status).toBe('PAID')
  })

  it('maps canceled to VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: { name: 'canceled' } })).status).toBe('VOIDED')
  })

  it('maps second_copy to AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: { name: 'second_copy' } })).status).toBe('AUTHORIZED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
