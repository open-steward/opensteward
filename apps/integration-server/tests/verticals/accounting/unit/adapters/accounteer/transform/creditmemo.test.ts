import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type AccounteerCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/creditmemo'

function makeRaw(overrides: Partial<AccounteerCreditMemo> = {}): AccounteerCreditMemo {
  return { id: '1', ...overrides }
}

describe('accounteer transformCreditMemo', () => {
  it('maps id', () => {
    expect(transformCreditMemo(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCreditMemo(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })
  it('maps status draft -> DRAFT', () => {
    expect(transformCreditMemo(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })
  it('maps status voided -> VOIDED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })
  it('maps date to postedAt as Date', () => {
    const result = transformCreditMemo(makeRaw({ date: '2024-03-01' }))
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
