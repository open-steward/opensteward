import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MoneybirdAccount } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/account'

function makeAccount(overrides: Partial<MoneybirdAccount> = {}): MoneybirdAccount {
  return { id: 300, name: 'Kosten kantoor', account_type: 'expense', ...overrides }
}

describe('transformAccount (moneybird)', () => {
  it('maps id and name', () => {
    const r = transformAccount(makeAccount())
    expect(r.id).toBe('300')
    expect(r.name).toBe('Kosten kantoor')
  })
  it('expense → EXPENSE', () => { expect(transformAccount(makeAccount({ account_type: 'expense' })).type).toBe('EXPENSE') })
  it('revenue → INCOME', () => { expect(transformAccount(makeAccount({ account_type: 'revenue' })).type).toBe('INCOME') })
  it('asset → ASSET', () => { expect(transformAccount(makeAccount({ account_type: 'asset' })).type).toBe('ASSET') })
  it('status always ACTIVE', () => { expect(transformAccount(makeAccount()).status).toBe('ACTIVE') })
  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
