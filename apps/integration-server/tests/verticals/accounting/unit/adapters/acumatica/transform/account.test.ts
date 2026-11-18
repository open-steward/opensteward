import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AcumaticaAccount } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/account'

function makeAccount(overrides: Partial<AcumaticaAccount> = {}): AcumaticaAccount {
  return {
    AccountID: '10000',
    AccountCD: '10000',
    Description: 'Cash',
    Type: 'Asset',
    Active: true,
    ...overrides,
  }
}

describe('transformAccount (Acumatica)', () => {
  it('maps id from AccountID', () => {
    expect(transformAccount(makeAccount()).id).toBe('10000')
  })

  it('maps name from Description', () => {
    expect(transformAccount(makeAccount()).name).toBe('Cash')
  })

  it('maps customerDefinedCode from AccountCD', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('10000')
  })

  it('maps Asset type to ASSET', () => {
    expect(transformAccount(makeAccount({ Type: 'Asset' })).type).toBe('ASSET')
  })

  it('maps Liability type to LIABILITY', () => {
    expect(transformAccount(makeAccount({ Type: 'Liability' })).type).toBe('LIABILITY')
  })

  it('maps Equity type to EQUITY', () => {
    expect(transformAccount(makeAccount({ Type: 'Equity' })).type).toBe('EQUITY')
  })

  it('maps Income type to INCOME', () => {
    expect(transformAccount(makeAccount({ Type: 'Income' })).type).toBe('INCOME')
  })

  it('maps Expense type to EXPENSE', () => {
    expect(transformAccount(makeAccount({ Type: 'Expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeAccount({ Type: 'Unknown' })).type).toBe('OTHER')
  })

  it('maps active status', () => {
    expect(transformAccount(makeAccount({ Active: true })).status).toBe('ACTIVE')
    expect(transformAccount(makeAccount({ Active: false })).status).toBe('ARCHIVED')
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
