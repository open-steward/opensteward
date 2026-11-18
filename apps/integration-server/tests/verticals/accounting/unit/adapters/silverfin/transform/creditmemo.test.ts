import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type SilverfinCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/creditmemo'

function makeCreditMemo(overrides: Partial<SilverfinCreditMemo> = {}): SilverfinCreditMemo {
  return {
    id: '4001',
    status: 'draft',
    credit_note_number: 'CN-2024-001',
    period: '2024-03-05',
    total_amount: 500,
    tax_amount: 100,
    currency: 'EUR',
    contact_id: '30',
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('4001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('30')
    expect(result.totalAmount).toBe(500)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as postedAt Date', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2024-03-05'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'approved' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformCreditMemo(makeCreditMemo({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
