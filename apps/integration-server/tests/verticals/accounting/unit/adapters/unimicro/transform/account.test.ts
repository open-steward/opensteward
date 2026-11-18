import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type UnimicroAccount,
} from '../../../../../../../src/verticals/accounting/adapters/unimicro/transform/account'

function makeAccount(overrides: Partial<UnimicroAccount> = {}): UnimicroAccount {
  return {
    ID: 1,
    AccountNumber: '1200',
    AccountName: 'Bank',
    Active: true,
    ...overrides,
  }
}

describe('transformAccount (Unimicro)', () => {
  it('maps account number and name', () => {
    const result = transformAccount(makeAccount())
    expect(result.customerDefinedCode).toBe('1200')
    expect(result.name).toBe('Bank')
  })

  it('defaults isActive to true when absent', () => {
    const raw = makeAccount()
    delete raw.Active
    const result = transformAccount(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ Active: true })).status).toBe('ACTIVE')
  })

  it('maps Active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ Active: false })).status).toBe('ARCHIVED')
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
