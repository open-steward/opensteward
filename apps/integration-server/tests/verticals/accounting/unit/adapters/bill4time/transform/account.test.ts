import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type Bill4TimeBankAccount,
} from '../../../../../../../src/verticals/accounting/adapters/bill4time/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<Bill4TimeBankAccount> = {}): Bill4TimeBankAccount {
  return {
    BankAccountId: 'BA-001',
    AccountName: 'Operating Account',
    AccountNumber: '****1234',
    RoutingNumber: '021000021',
    BankName: 'Chase Bank',
    Balance: 50000,
    Currency: 'USD',
    IsActive: true,
    ...overrides,
  }
}

describe('transformAccount (bill4time)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('BA-001')
    // AccountName takes precedence over BankName for name
    expect(result.name).toBe('Operating Account')
    expect(result.customerDefinedCode).toBe('****1234')
    expect(result.currency).toBe('USD')
    // Bill4Time passes Balance directly without minor-unit conversion
    expect(result.balance).toBe(50000)
  })

  it('falls back name to BankName when AccountName is missing', () => {
    const result = transformAccount(makeRaw({ AccountName: undefined }))
    expect(result.name).toBe('Chase Bank')
  })

  it('maps IsActive=true to ACTIVE', () => {
    const result = transformAccount(makeRaw({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps IsActive=false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('defaults to ACTIVE when IsActive is undefined', () => {
    const result = transformAccount(makeRaw({ IsActive: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
