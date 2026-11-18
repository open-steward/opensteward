import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AccountableAccount } from '../../../../../../../src/verticals/accounting/adapters/accountable/transform/account'

function makeAccount(overrides: Partial<AccountableAccount> = {}): AccountableAccount {
  return {
    id: 'acc-1',
    code: '1200',
    name: 'Forderungen',
    type: 'asset',
    isActive: true,
    ...overrides,
  }
}

describe('transformAccount (Accountable)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-1')
    expect(result.name).toBe('Forderungen')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
