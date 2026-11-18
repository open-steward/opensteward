import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AppFolioAccount } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/account'

function makeAccount(overrides: Partial<AppFolioAccount> = {}): AppFolioAccount {
  return {
    id: '301',
    account_number: '4000',
    name: 'Rental Income',
    account_type: 'Income',
    balance: 50000,
    is_active: true,
    property_id: 'prop_1',
    ...overrides,
  }
}

describe('transformAccount (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('301')
    expect(result.name).toBe('Rental Income')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.balance).toBe(50000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Income type to INCOME', () => {
    const result = transformAccount(makeAccount({ account_type: 'Income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps Asset type to ASSET', () => {
    const result = transformAccount(makeAccount({ account_type: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability type to LIABILITY', () => {
    const result = transformAccount(makeAccount({ account_type: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps Equity type to EQUITY', () => {
    const result = transformAccount(makeAccount({ account_type: 'Equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps Expense type to EXPENSE', () => {
    const result = transformAccount(makeAccount({ account_type: 'Expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeAccount({ account_type: 'Other' }))
    expect(result.type).toBe('OTHER')
  })

  it('sets status to ARCHIVED when is_active is false', () => {
    const result = transformAccount(makeAccount({ is_active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('parses string balance', () => {
    const result = transformAccount(makeAccount({ balance: '9876.54' }))
    expect(result.balance).toBe(9876.54)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
