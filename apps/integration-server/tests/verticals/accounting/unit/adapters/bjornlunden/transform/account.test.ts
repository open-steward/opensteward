import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BlAccount } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/account'

function makeAccount(overrides: Partial<BlAccount> = {}): BlAccount {
  return {
    AccountNumber: 1910,
    Name: 'Kassa',
    Description: 'Cash account',
    Type: 'Asset',
    IsActive: true,
    Currency: 'SEK',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps account number as id string', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1910')
  })

  it('maps account number as customerDefinedCode', () => {
    const result = transformAccount(makeAccount())
    expect(result.customerDefinedCode).toBe('1910')
  })

  it('maps name', () => {
    const result = transformAccount(makeAccount())
    expect(result.name).toBe('Kassa')
  })

  it('maps description', () => {
    const result = transformAccount(makeAccount())
    expect(result.description).toBe('Cash account')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeAccount({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps account type strings correctly', () => {
    expect(transformAccount(makeAccount({ Type: 'Asset' })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ Type: 'Liability' })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ Type: 'Equity' })).type).toBe('EQUITY')
    expect(transformAccount(makeAccount({ Type: 'Income' })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ Type: 'Expense' })).type).toBe('EXPENSE')
    expect(transformAccount(makeAccount({ Type: 'Unknown' })).type).toBe('OTHER')
  })

  it('maps currency', () => {
    const result = transformAccount(makeAccount())
    expect(result.currency).toBe('SEK')
  })

  it('returns undefined for empty string fields', () => {
    const result = transformAccount(makeAccount({ Name: '', Description: '', Currency: '' }))
    expect(result.name).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.currency).toBeUndefined()
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
