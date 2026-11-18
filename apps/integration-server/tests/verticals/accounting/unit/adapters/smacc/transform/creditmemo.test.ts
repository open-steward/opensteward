import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type SmaccCreditNote } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/creditmemo'

function makeRaw(overrides: Partial<SmaccCreditNote> = {}): SmaccCreditNote {
  return {
    id: 'cn-1',
    number: 'CN-001',
    contact_id: 'c-3',
    status: 'authorized',
    currency: 'EUR',
    tax_amount: 50,
    total: 550,
    remaining_credit: 550,
    date: '2024-04-01',
    line_items: [],
    ...overrides,
  }
}

describe('smacc transformCreditMemo', () => {
  it('maps id to id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('cn-1')
  })

  it('maps number to creditmemoNumber', () => {
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

  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw()).postedAt).toEqual(new Date('2024-04-01'))
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
