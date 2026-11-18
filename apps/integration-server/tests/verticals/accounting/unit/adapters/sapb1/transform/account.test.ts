import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type SapB1Account,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/account'

function makeAccount(overrides: Partial<SapB1Account> = {}): SapB1Account {
  return {
    Code: 'ACCT-001',
    Name: 'Cash',
    ExternalCode: 'EXT-001',
    AcctCurrency: 'USD',
    Balance: 10000,
    Frozen: 'tNO',
    AccountType: 'gt_Assets',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps Code to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('ACCT-001')
  })

  it('maps Name to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps ExternalCode to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('EXT-001')
  })

  it('falls back to Code for customerDefinedCode when ExternalCode is empty', () => {
    expect(
      transformAccount(makeAccount({ ExternalCode: '' })).customerDefinedCode,
    ).toBe('ACCT-001')
  })

  it('maps AcctCurrency to currency', () => {
    expect(transformAccount(makeAccount()).currency).toBe('USD')
  })

  it('maps Balance correctly', () => {
    expect(transformAccount(makeAccount()).balance).toBe(10000)
  })

  it('maps Frozen tNO to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ Frozen: 'tNO' })).status).toBe('ACTIVE')
  })

  it('maps Frozen tYES to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ Frozen: 'tYES' })).status).toBe('ARCHIVED')
  })

  it('maps AccountType gt_Sales to INCOME', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Sales' })).type).toBe('INCOME')
  })

  it('maps AccountType gt_Expenditure to EXPENSE', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Expenditure' })).type).toBe('EXPENSE')
  })

  it('maps AccountType gt_Assets to ASSET', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Assets' })).type).toBe('ASSET')
  })

  it('maps AccountType gt_Liability to LIABILITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Liability' })).type).toBe('LIABILITY')
  })

  it('maps AccountType gt_Equity to EQUITY', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Equity' })).type).toBe('EQUITY')
  })

  it('maps unknown AccountType to OTHER', () => {
    expect(transformAccount(makeAccount({ AccountType: 'gt_Unknown' })).type).toBe('OTHER')
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
