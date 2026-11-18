import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ProsvasisAccount } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/account'

function makeAccount(overrides: Partial<ProsvasisAccount> = {}): ProsvasisAccount {
  return {
    id: '300',
    Code: '1000',
    Name: 'Cash',
    Type: 'Asset',
    Balance: 10000,
    ...overrides,
  }
}

describe('transformAccount (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('300')
    expect(result.name).toBe('Cash')
    expect(result.customerDefinedCode).toBe('1000')
    expect(result.balance).toBe(10000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Asset to ASSET', () => {
    const result = transformAccount(makeAccount({ Type: 'Asset' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps Liability to LIABILITY', () => {
    const result = transformAccount(makeAccount({ Type: 'Liability' }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps Equity to EQUITY', () => {
    const result = transformAccount(makeAccount({ Type: 'Equity' }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps Income to INCOME', () => {
    const result = transformAccount(makeAccount({ Type: 'Income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps Expense to EXPENSE', () => {
    const result = transformAccount(makeAccount({ Type: 'Expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    const result = transformAccount(makeAccount({ Type: 'Custom' }))
    expect(result.type).toBe('OTHER')
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
