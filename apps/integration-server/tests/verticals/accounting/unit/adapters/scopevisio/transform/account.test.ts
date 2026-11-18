import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type ScopevisioImpersonalAccount,
} from '../../../../../../../src/verticals/accounting/adapters/scopevisio/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(
  overrides: Partial<ScopevisioImpersonalAccount> = {},
): ScopevisioImpersonalAccount {
  return {
    number: '4000',
    name: 'Umsatzerlöse',
    type: 'INCOME',
    category: 'E',
    vatCode: 'UST19',
    deactivated: false,
    isFinanceAccount: true,
    ...overrides,
  }
}

describe('transformAccount (scopevisio)', () => {
  it('maps number to id and customerDefinedCode', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('4000')
    expect(result.customerDefinedCode).toBe('4000')
  })

  it('maps name to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Umsatzerlöse')
  })

  it('maps type INCOME correctly', () => {
    expect(transformAccount(makeRaw({ type: 'INCOME' })).type).toBe('INCOME')
  })

  it('maps deactivated=false to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ deactivated: false })).status).toBe('ACTIVE')
  })

  it('maps deactivated=true to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ deactivated: true })).status).toBe('ARCHIVED')
  })

  it('maps German type AUFWANDSKONTO to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'AUFWANDSKONTO' })).type).toBe('EXPENSE')
  })

  it('maps unknown type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'UNKNOWN_TYPE' })).type).toBe('OTHER')
  })

  it('passes raw object as metadata', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
