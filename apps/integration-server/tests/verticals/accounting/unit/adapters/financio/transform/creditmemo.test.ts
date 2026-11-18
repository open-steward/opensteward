import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FinancioCreditNote } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/creditmemo'

function makeRaw(overrides: Partial<FinancioCreditNote> = {}): FinancioCreditNote {
  return {
    id: '400',
    credit_note_no: 'CN-001',
    credit_note_date: '2024-04-01',
    sub_total: 500,
    tax_total: 30,
    grand_total: 530,
    outstanding: 530,
    customer_id: '10',
    customer_name: 'Acme Pte Ltd',
    status: 0,
    items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('400')
    expect(result.creditmemoNumber).toBe('CN-001')
    expect(result.contactId).toBe('10')
    expect(result.totalAmount).toBe(530)
    expect(result.taxAmount).toBe(30)
    expect(result.balanceAmount).toBe(530)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-04-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ credit_note_no: 'CN-SPECIAL' })
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['credit_note_no']).toBe('CN-SPECIAL')
  })

  it('maps status 0 to DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 2 })).status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 3 })).status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
