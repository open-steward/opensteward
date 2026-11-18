import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SageAccount } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/account'

function makeRaw(overrides: Partial<SageAccount> = {}): SageAccount {
  return {
    id: 'acct-001',
    display_name: 'Bank Account',
    nominal_code: '1200',
    account_type: { name: 'ASSET' },
    is_visible: true,
    ...overrides,
  }
}

describe('transformAccount (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acct-001')
    expect(result.name).toBe('Bank Account')
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps LIABILITY type', () => {
    expect(transformAccount(makeRaw({ account_type: { name: 'LIABILITY' } })).type).toBe('LIABILITY')
  })

  it('maps EQUITY type', () => {
    expect(transformAccount(makeRaw({ account_type: { name: 'EQUITY' } })).type).toBe('EQUITY')
  })

  it('maps INCOME type', () => {
    expect(transformAccount(makeRaw({ account_type: { name: 'INCOME' } })).type).toBe('INCOME')
  })

  it('maps EXPENSE type', () => {
    expect(transformAccount(makeRaw({ account_type: { name: 'EXPENSE' } })).type).toBe('EXPENSE')
  })

  it('maps invisible account to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_visible: false })).status).toBe('ARCHIVED')
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
