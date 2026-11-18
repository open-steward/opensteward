import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type AccountingSeedAccount,
} from '../../../../../../../src/verticals/accounting/adapters/accountingseed/transform/account'

function makeAccount(overrides: Partial<AccountingSeedAccount> = {}): AccountingSeedAccount {
  return {
    Id: 'a0B5e000001ABC1',
    Name: 'Sales Revenue',
    AcctSeed__Description__c: 'Revenue from product sales',
    AcctSeed__Type__c: 'Revenue',
    AcctSeed__Sub_Type_1__c: 'Operating Revenue',
    AcctSeed__Sub_Type_2__c: 'Product Sales',
    AcctSeed__Bank__c: false,
    AcctSeed__Active__c: true,
    AcctSeed__GL_Account_Number__c: '4000',
    CurrencyIsoCode: 'USD',
    AcctSeed__Balance__c: 50000,
    CreatedDate: '2024-01-15T10:00:00.000Z',
    LastModifiedDate: '2024-06-01T14:30:00.000Z',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id from Id', () => {
    expect(transformAccount(makeAccount()).id).toBe('a0B5e000001ABC1')
  })

  it('maps name from Name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales Revenue')
  })

  it('maps description', () => {
    expect(transformAccount(makeAccount()).description).toBe('Revenue from product sales')
  })

  it('maps GL_Account_Number to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4000')
  })

  it('maps Active__c=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Active__c: true })).status).toBe('ACTIVE')
  })

  it('maps Active__c=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Active__c: false })).status).toBe('ARCHIVED')
  })

  it('maps type containing "asset" to ASSET', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Asset' })).type).toBe('ASSET')
  })

  it('maps type containing "liabilit" to LIABILITY', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps type containing "equity" to EQUITY', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps type containing "revenue" to INCOME', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Revenue' })).type).toBe('INCOME')
  })

  it('maps type containing "income" to INCOME', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Income' })).type).toBe('INCOME')
  })

  it('maps type containing "expense" to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ AcctSeed__Type__c: 'Custom' })).type).toBe('OTHER')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformAccount(makeAccount({ Name: '' })).name).toBeUndefined()
  })

  it('maps balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(50000)
  })

  it('maps group from Sub_Type_1', () => {
    expect(transformAccount(makeAccount()).group).toBe('Operating Revenue')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
