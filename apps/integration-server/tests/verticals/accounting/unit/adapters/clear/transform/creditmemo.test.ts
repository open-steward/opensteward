import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type ClearCreditNote,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/creditmemo'

function makeRaw(overrides: Partial<ClearCreditNote> = {}): ClearCreditNote {
  return {
    id: 'cn-uuid-001',
    credit_note_number: 'CN/2024/001',
    credit_note_date: '2024-03-15',
    total_taxable_value: 2000,
    total_tax_amount: 360,
    grand_total: 2360,
    balance_amount: 2360,
    customer_id: 'contact-uuid-001',
    customer_name: 'Acme Pvt Ltd',
    status: 'authorized',
    line_items: [],
    ...overrides,
  }
}

describe('transformCreditMemo (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('cn-uuid-001')
    expect(result.creditmemoNumber).toBe('CN/2024/001')
    expect(result.contactId).toBe('contact-uuid-001')
    expect(result.totalAmount).toBe(2360)
    expect(result.taxAmount).toBe(360)
    expect(result.balanceAmount).toBe(2360)
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformCreditMemo(makeRaw({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps authorized status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'authorized' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformCreditMemo(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
