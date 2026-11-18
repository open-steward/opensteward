import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type IntacctAccount,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/account'

function makeAccount(overrides: Partial<IntacctAccount> = {}): IntacctAccount {
  return {
    RECORDNO: 'acct-1',
    ACCOUNTNO: '1001',
    TITLE: 'Cash',
    ACCOUNTTYPE: 'balancesheet',
    STATUS: 'active',
    NORMALBALANCE: 'debit',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps RECORDNO to id', () => {
    expect(transformAccount(makeAccount()).id).toBe('acct-1')
  })

  it('maps TITLE to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps ACCOUNTNO to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('1001')
  })

  it('maps STATUS active to ACTIVE', () => {
    expect(transformAccount(makeAccount({ STATUS: 'active' })).status).toBe('ACTIVE')
  })

  it('maps STATUS inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ STATUS: 'inactive' })).status).toBe('ARCHIVED')
  })

  it('maps incomestatement with credit normalbalance to INCOME', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'incomestatement', NORMALBALANCE: 'credit' })).type,
    ).toBe('INCOME')
  })

  it('maps incomestatement with debit normalbalance to EXPENSE', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'incomestatement', NORMALBALANCE: 'debit' })).type,
    ).toBe('EXPENSE')
  })

  it('maps balancesheet account starting with 1 to ASSET', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'balancesheet', ACCOUNTNO: '1001' })).type,
    ).toBe('ASSET')
  })

  it('maps balancesheet account starting with 2 to LIABILITY', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'balancesheet', ACCOUNTNO: '2001' })).type,
    ).toBe('LIABILITY')
  })

  it('maps balancesheet account starting with 3 to EQUITY', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'balancesheet', ACCOUNTNO: '3001' })).type,
    ).toBe('EQUITY')
  })

  it('maps unknown account type to OTHER', () => {
    expect(
      transformAccount(makeAccount({ ACCOUNTTYPE: 'unknown', ACCOUNTNO: '9999' })).type,
    ).toBe('OTHER')
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
