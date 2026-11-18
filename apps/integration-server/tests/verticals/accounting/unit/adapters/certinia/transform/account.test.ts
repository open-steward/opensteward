import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type CertiniaAccount } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/account'

function makeAccount(overrides: Partial<CertiniaAccount> = {}): CertiniaAccount {
  return {
    Id: 'ACC000000001',
    Name: 'Revenue Account',
    Account_Code__c: '4000',
    Type__c: 'income',
    Balance__c: 100000,
    IsActive__c: true,
    ...overrides,
  }
}

describe('transformAccount (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('ACC000000001')
    expect(result.name).toBe('Revenue Account')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.balance).toBe(100000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('maps asset account type', () => {
    expect(transformAccount(makeAccount({ Type__c: 'asset' })).type).toBe('ASSET')
  })

  it('maps liability account type', () => {
    expect(transformAccount(makeAccount({ Type__c: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity account type', () => {
    expect(transformAccount(makeAccount({ Type__c: 'equity' })).type).toBe('EQUITY')
  })

  it('maps income account type', () => {
    expect(transformAccount(makeAccount({ Type__c: 'income' })).type).toBe('INCOME')
  })

  it('maps expense account type', () => {
    expect(transformAccount(makeAccount({ Type__c: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ Type__c: 'miscellaneous' })).type).toBe('OTHER')
  })

  it('maps inactive account to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ IsActive__c: false })).status).toBe('ARCHIVED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
