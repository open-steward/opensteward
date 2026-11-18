import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type MazumaCreditNote } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/creditmemo'

function makeRaw(overrides: Partial<MazumaCreditNote> = {}): MazumaCreditNote {
  return { id: '1', ...overrides }
}

describe('mazuma transformCreditMemo', () => {
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
  it('defaults currency to GBP', () => {
    expect(transformCreditMemo(makeRaw()).currency).toBe('GBP')
  })
  it('maps status authorized -> AUTHORIZED', () => {
    expect(transformCreditMemo(makeRaw({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })
  it('maps date to postedAt as Date', () => {
    expect(transformCreditMemo(makeRaw({ date: '2024-03-01' })).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
