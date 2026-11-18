import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ReckonAccount } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/account'

function makeRaw(overrides: Partial<ReckonAccount> = {}): ReckonAccount {
  return {
    id: 'acc-001',
    number: '1100',
    name: 'Cash at Bank',
    type: 'ASSET',
    isActive: true,
    description: 'Main bank account',
    balance: 50000,
    ...overrides,
  }
}

describe('transformAccount (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('acc-001')
    expect(result.name).toBe('Cash at Bank')
    expect(result.customerDefinedCode).toBe('1100')
    expect(result.description).toBe('Main bank account')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
    expect(result.balance).toBe(50000)
  })

  it('maps isActive false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ isActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps account types correctly', () => {
    expect(transformAccount(makeRaw({ type: 'ASSET' })).type).toBe('ASSET')
    expect(transformAccount(makeRaw({ type: 'LIABILITY' })).type).toBe('LIABILITY')
    expect(transformAccount(makeRaw({ type: 'EQUITY' })).type).toBe('EQUITY')
    expect(transformAccount(makeRaw({ type: 'INCOME' })).type).toBe('INCOME')
    expect(transformAccount(makeRaw({ type: 'EXPENSE' })).type).toBe('EXPENSE')
    expect(transformAccount(makeRaw({ type: 'UNKNOWN' })).type).toBe('OTHER')
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
