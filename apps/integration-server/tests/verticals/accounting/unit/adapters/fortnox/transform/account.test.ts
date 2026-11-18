import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import {
  transformAccount,
  type FortnoxAccount,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/account'

function makeAccount(overrides: Partial<FortnoxAccount> = {}): FortnoxAccount {
  return {
    Number: 3000,
    Description: 'Sales revenue',
    Active: true,
    BalanceBroughtForward: 150000,
    BalanceCarriedForward: 200000,
    VATCode: 'MP1',
    SRU: 7011,
    CostCenter: '',
    Project: '',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps Number to id and customerDefinedCode', () => {
    const a = transformAccount(makeAccount())
    expect(a.id).toBe('3000')
    expect(a.customerDefinedCode).toBe('3000')
  })

  it('maps Description to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Sales revenue')
  })

  it('maps Active=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ Active: true })).status).toBe('ACTIVE')
  })

  it('maps Active=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ Active: false })).status).toBe('ARCHIVED')
  })

  it('maps BalanceBroughtForward to balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(15000000)
  })

  it('passes raw object as metadata (including VATCode, SRU)', () => {
    const raw = makeAccount()
    const a = transformAccount(raw)
    expect(a.metadata).toBe(raw)
    expect((a.metadata as Record<string, unknown>)['VATCode']).toBe('MP1')
    expect((a.metadata as Record<string, unknown>)['SRU']).toBe(7011)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
