import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DolibarrAccount } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/account'

function makeRaw(overrides: Partial<DolibarrAccount> = {}): DolibarrAccount {
  return {
    rowid: 3,
    ref: '512000',
    label: 'Banque principale',
    type: 1,
    active: 1,
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('3')
    expect(result.name).toBe('Banque principale')
    expect(result.customerDefinedCode).toBe('512000')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(50000)
  })

  it('maps type 1 to ASSET', () => {
    const result = transformAccount(makeRaw({ type: 1 }))
    expect(result.type).toBe('ASSET')
  })

  it('maps type 2 to LIABILITY', () => {
    const result = transformAccount(makeRaw({ type: 2 }))
    expect(result.type).toBe('LIABILITY')
  })

  it('maps type 3 to EQUITY', () => {
    const result = transformAccount(makeRaw({ type: 3 }))
    expect(result.type).toBe('EQUITY')
  })

  it('maps type 4 to INCOME', () => {
    const result = transformAccount(makeRaw({ type: 4 }))
    expect(result.type).toBe('INCOME')
  })

  it('maps type 5 to EXPENSE', () => {
    const result = transformAccount(makeRaw({ type: 5 }))
    expect(result.type).toBe('EXPENSE')
  })

  it('maps inactive account', () => {
    const result = transformAccount(makeRaw({ active: 0 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
