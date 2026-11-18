import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type XeroAccount } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/account'

function makeAccount(overrides: Partial<XeroAccount> = {}): XeroAccount {
  return {
    AccountID: 'acc-001',
    Code: '200',
    Name: 'Sales Account',
    Type: 'SALES',
    Status: 'ACTIVE',
    Description: 'Revenue from sales',
    CurrencyCode: 'GBP',
    ...overrides,
  }
}

describe('transformAccount (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Sales Account')
    expect(result.customerDefinedCode).toBe('200')
    expect(result.description).toBe('Revenue from sales')
    expect(result.currency).toBe('GBP')
  })

  it('maps ACTIVE status', () => {
    expect(transformAccount(makeAccount({ Status: 'ACTIVE' })).status).toBe('ACTIVE')
  })

  it('maps ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ Status: 'ARCHIVED' })).status).toBe('ARCHIVED')
  })

  it('maps known account types', () => {
    expect(transformAccount(makeAccount({ Type: 'BANK' })).type).toBe('ASSET')
    expect(transformAccount(makeAccount({ Type: 'EQUITY' })).type).toBe('EQUITY')
    expect(transformAccount(makeAccount({ Type: 'CURRLIAB' })).type).toBe('LIABILITY')
    expect(transformAccount(makeAccount({ Type: 'REVENUE' })).type).toBe('INCOME')
    expect(transformAccount(makeAccount({ Type: 'EXPENSE' })).type).toBe('EXPENSE')
  })

  it('maps unknown account type to OTHER', () => {
    expect(transformAccount(makeAccount({ Type: 'UNKNOWN_TYPE' })).type).toBe('OTHER')
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
