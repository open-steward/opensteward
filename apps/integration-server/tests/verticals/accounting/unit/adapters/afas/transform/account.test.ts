import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type AfasFinancialAccount,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<AfasFinancialAccount> = {}): AfasFinancialAccount {
  return {
    AccountNr: '4000',
    AccountDesc: 'Sales Revenue',
    AccountType: 'R',
    IsActive: true,
    Balance: 5000,
    CurrencyId: 'EUR',
    ...overrides,
  }
}

describe('transformAccount (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('4000')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    // Balance=5000 → toMinorUnits → 500000
    expect(result.balance).toBe(500000)
  })

  it('maps IsActive=true to ACTIVE', () => {
    const result = transformAccount(makeRaw({ IsActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps IsActive=false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ IsActive: false }))
    expect(result.status).toBe('ARCHIVED')
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
