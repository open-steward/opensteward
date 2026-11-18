import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MoneyForwardCreditNote } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/creditmemo'

function makeRaw(overrides: Partial<MoneyForwardCreditNote> = {}): MoneyForwardCreditNote {
  return {
    id: 'cn-001',
    credit_note_number: 'CN-2024-001',
    credit_note_date: '2024-07-10',
    price_before_tax: 5000,
    price: 5500,
    tax: 500,
    partner_id: 'partner-042',
    partner_name: 'Refund Client',
    ...overrides,
  }
}

describe('transformCreditMemo (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('cn-001')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('partner-042')
    expect(result.totalAmount).toBe(5500)
    expect(result.taxAmount).toBe(500)
  })

  it('parses credit_note_date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-07-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status to AUTHORIZED by default', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.status).toBe('AUTHORIZED')
  })

  it('returns undefined contactId when partner_id is null', () => {
    const result = transformCreditMemo(makeRaw({ partner_id: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('handles null credit_note_number', () => {
    const result = transformCreditMemo(makeRaw({ credit_note_number: null }))
    expect(result.creditmemoNumber).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
