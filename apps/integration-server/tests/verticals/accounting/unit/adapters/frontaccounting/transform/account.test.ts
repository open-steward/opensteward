import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type FAAccount } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/account'

function makeRaw(overrides: Partial<FAAccount> = {}): FAAccount {
  return {
    account_code: '1000',
    account_name: 'Cash',
    account_type: 1,
    inactive: 0,
    ...overrides,
  }
}

describe('transformAccount (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('1000')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps type 1 to ASSET', () => {
    expect(transformAccount(makeRaw({ account_type: 1 })).type).toBe('ASSET')
  })

  it('maps type 2 to LIABILITY', () => {
    expect(transformAccount(makeRaw({ account_type: 2 })).type).toBe('LIABILITY')
  })

  it('maps type 3 to EQUITY', () => {
    expect(transformAccount(makeRaw({ account_type: 3 })).type).toBe('EQUITY')
  })

  it('maps type 4 to INCOME', () => {
    expect(transformAccount(makeRaw({ account_type: 4 })).type).toBe('INCOME')
  })

  it('maps type 5 to EXPENSE', () => {
    expect(transformAccount(makeRaw({ account_type: 5 })).type).toBe('EXPENSE')
  })

  it('maps inactive account to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ inactive: 1 })).status).toBe('ARCHIVED')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
