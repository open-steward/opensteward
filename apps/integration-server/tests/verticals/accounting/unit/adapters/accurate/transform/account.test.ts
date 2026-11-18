import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AccurateAccount } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/account'

function makeAccount(overrides: Partial<AccurateAccount> = {}): AccurateAccount {
  return {
    id: 2001,
    no: '1-1001',
    name: 'Cash on Hand',
    type: 'ASSET',
    balance: 50000000,
    ...overrides,
  }
}

describe('transformAccount (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('2001')
    expect(result.name).toBe('Cash on Hand')
    expect(result.customerDefinedCode).toBe('1-1001')
    expect(result.balance).toBe(50000000)
  })

  it('maps ASSET type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'ASSET' })).type).toBe('ASSET')
  })

  it('maps LIABILITY type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'LIABILITY' })).type).toBe('LIABILITY')
  })

  it('maps EQUITY type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'EQUITY' })).type).toBe('EQUITY')
  })

  it('maps INCOME type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps EXPENSE type correctly', () => {
    expect(transformAccount(makeAccount({ type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ type: 'UNKNOWN' })).type).toBe('OTHER')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
