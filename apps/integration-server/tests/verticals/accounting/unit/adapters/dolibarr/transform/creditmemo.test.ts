import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type DolibarrCredit } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/creditmemo'

function makeRaw(overrides: Partial<DolibarrCredit> = {}): DolibarrCredit {
  return {
    id: 9,
    ref: 'AV2024-0001',
    status: 1,
    date: 1705276800,
    total_ht: 500,
    total_tva: 100,
    total_ttc: 600,
    multicurrency_code: 'EUR',
    fk_soc: 7,
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('9')
    expect(result.creditmemoNumber).toBe('AV2024-0001')
    expect(result.contactId).toBe('7')
    expect(result.totalAmount).toBe(600)
    expect(result.taxAmount).toBe(100)
    expect(result.currency).toBe('EUR')
  })

  it('parses unix timestamp as Date', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
