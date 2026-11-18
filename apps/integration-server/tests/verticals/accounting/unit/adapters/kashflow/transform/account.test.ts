import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type KashflowBankAccount,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<KashflowBankAccount> = {}): KashflowBankAccount {
  return {
    Id: 42,
    Code: 1010,
    AccountName: 'Current Account',
    IsDefaultAccount: false,
    IsArchived: false,
    BankBalance: 100,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('prefers Code over Id for id and customerDefinedCode', () => {
    const result = transformAccount(makeAccount({ Code: 1010, Id: 42 }))
    expect(result.id).toBe('1010')
    expect(result.customerDefinedCode).toBe('1010')
  })

  it('falls back to Id when Code is absent', () => {
    const result = transformAccount(makeAccount({ Code: undefined, Id: 42 }))
    expect(result.id).toBe('42')
    expect(result.customerDefinedCode).toBe('42')
  })

  it('maps AccountName to name', () => {
    const result = transformAccount(makeAccount({ AccountName: 'Savings Account' }))
    expect(result.name).toBe('Savings Account')
  })

  it('maps IsArchived=false to ACTIVE status', () => {
    const result = transformAccount(makeAccount({ IsArchived: false }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps IsArchived=true to ARCHIVED status', () => {
    const result = transformAccount(makeAccount({ IsArchived: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps IsArchived=undefined to ACTIVE status', () => {
    const result = transformAccount(makeAccount({ IsArchived: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('converts BankBalance decimal pounds to minor units (pence)', () => {
    const result = transformAccount(makeAccount({ BankBalance: 100 }))
    expect(result.balance).toBe(10000)
  })

  it('converts fractional BankBalance correctly', () => {
    const result = transformAccount(makeAccount({ BankBalance: 49.99 }))
    expect(result.balance).toBe(4999)
  })

  it('sets balance to undefined when BankBalance is absent', () => {
    const result = transformAccount(makeAccount({ BankBalance: undefined }))
    expect(result.balance).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces output that passes AccountSchema validation', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
