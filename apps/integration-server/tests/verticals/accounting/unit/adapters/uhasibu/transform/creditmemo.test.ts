import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type UhasibuCreditNote } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/creditmemo'

function makeRaw(overrides: Partial<UhasibuCreditNote> = {}): UhasibuCreditNote {
  return {
    id: 'ucn-1',
    credit_note_number: 'CN-001',
    contact_id: 'c-2',
    status: 'authorized',
    currency: 'KES',
    tax_amount: 100,
    total_amount: 1100,
    remaining_credit: 1100,
    issue_date: '2024-04-10',
    line_items: [],
    ...overrides,
  }
}

describe('uhasibu transformCreditMemo', () => {
  it('maps id to id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('ucn-1')
  })

  it('maps credit_note_number to creditmemoNumber', () => {
    expect(transformCreditMemo(makeRaw()).creditmemoNumber).toBe('CN-001')
  })

  it('maps status=authorized to AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps status=applied to PAID', () => {
    expect(transformCreditMemo(makeRaw({ status: 'applied' })).status).toBe('PAID')
  })

  it('maps status=voided to VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-04-10'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
