import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ClearBooksCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ClearBooksCreditMemo> = {}): ClearBooksCreditMemo {
  return {
    credit_note_id: '901',
    credit_note_number: 'CN-2024-001',
    entity_id: '42',
    date_created: '20/03/2024',
    total_gross: 240,
    total_net: 200,
    total_tax: 40,
    currency: 'GBP',
    status: 'unpaid',
    line_items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('901')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(240)
    expect(result.taxAmount).toBe(40)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps unpaid status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'unpaid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps void status to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'void' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeCreditMemo({
      line_items: [
        {
          id: 5,
          description: 'Refund item',
          quantity: 1,
          unit_price: 200,
          total_net: 200,
          tax_amount: 40,
          account_code: '4000',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('5')
    expect(result.lineItems![0].totalAmount).toBe(200)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
