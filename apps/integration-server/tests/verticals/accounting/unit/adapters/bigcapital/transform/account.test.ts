import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type BigcapitalAccount,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<BigcapitalAccount> = {}): BigcapitalAccount {
  return {
    id: 100,
    name: 'Sales Revenue',
    code: '4000',
    accountType: 'income',
    parentAccountId: 90,
    active: true,
    amount: 15000,
    currencyCode: 'USD',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeRaw())
    expect(result.id).toBe('100')
    expect(result.name).toBe('Sales Revenue')
    expect(result.customerDefinedCode).toBe('4000')
    expect(result.parentId).toBe('90')
    expect(result.currency).toBe('USD')
    // amount=15000 → toMinor → 1500000
    expect(result.balance).toBe(1500000)
  })

  it('maps active=true to ACTIVE', () => {
    const result = transformAccount(makeRaw({ active: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED', () => {
    const result = transformAccount(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps accountType income to INCOME', () => {
    const result = transformAccount(makeRaw({ accountType: 'income' }))
    expect(result.type).toBe('INCOME')
  })

  it('maps accountType bank to ASSET', () => {
    const result = transformAccount(makeRaw({ accountType: 'bank' }))
    expect(result.type).toBe('ASSET')
  })

  it('maps accountType expense to EXPENSE', () => {
    const result = transformAccount(makeRaw({ accountType: 'expense' }))
    expect(result.type).toBe('EXPENSE')
  })

  it('parses dates as Date objects', () => {
    const result = transformAccount(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-06-01T00:00:00.000Z'))
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
