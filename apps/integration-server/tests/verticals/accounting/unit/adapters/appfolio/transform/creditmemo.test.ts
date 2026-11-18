import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AppFolioCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/creditmemo'

function makeCreditMemo(overrides: Partial<AppFolioCreditMemo> = {}): AppFolioCreditMemo {
  return {
    id: '901',
    credit_memo_number: 'CM-2024-001',
    tenant_id: '42',
    property_id: 'prop_1',
    date: '2024-03-20',
    amount: 500,
    tax_amount: 0,
    currency: 'USD',
    status: 'approved',
    line_items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('901')
    expect(result.creditmemoNumber).toBe('CM-2024-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(500)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO date as Date object', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'approved' }))
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

  it('maps voided status to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps line items to lineItems', () => {
    const raw = makeCreditMemo({
      line_items: [
        {
          id: 5,
          description: 'Rent credit',
          quantity: 1,
          unit_price: 500,
          amount: 500,
          account_id: '4001',
        },
      ],
    })
    const result = transformCreditMemo(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
