import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type FACredit } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/creditmemo'

function makeRaw(overrides: Partial<FACredit> = {}): FACredit {
  return {
    id: 15,
    reference: 'CN-2024-001',
    tran_date: '2024-01-25',
    debtor_no: 5,
    curr_code: 'USD',
    total: 300,
    tax_total: 50,
    lines: [],
    ...overrides,
  }
}

describe('transformCreditMemo (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('15')
    expect(result.creditmemoNumber).toBe('CN-2024-001')
    expect(result.contactId).toBe('5')
    expect(result.totalAmount).toBe(300)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-25'))
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
