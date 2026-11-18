import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type MriAccount,
} from '../../../../../../../src/verticals/accounting/adapters/mri-software/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<MriAccount> = {}): MriAccount {
  return {
    id: 'acct-001',
    code: '4000',
    name: 'Sales Revenue',
    description: 'Revenue from sales',
    accountType: 'income',
    isActive: true,
    currencyCode: 'USD',
    balance: 500000,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformAccount (mri-software)', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('acct-001')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('4000')
  })

  it('maps name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Sales Revenue')
  })

  it('maps "income" accountType to INCOME', () => {
    expect(transformAccount(makeRaw({ accountType: 'income' })).type).toBe('INCOME')
  })

  it('maps "asset" accountType to ASSET', () => {
    expect(transformAccount(makeRaw({ accountType: 'asset' })).type).toBe('ASSET')
  })

  it('maps "expense" accountType to EXPENSE', () => {
    expect(transformAccount(makeRaw({ accountType: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps unknown accountType to OTHER', () => {
    expect(transformAccount(makeRaw({ accountType: 'unknown_type' })).type).toBe('OTHER')
  })

  it('maps isActive=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ isActive: false })).status).toBe('ARCHIVED')
  })

  it('maps currencyCode to currency', () => {
    expect(transformAccount(makeRaw()).currency).toBe('USD')
  })

  it('maps balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(500000)
  })

  it('maps createdAt to Date', () => {
    expect(transformAccount(makeRaw()).createdAt).toEqual(new Date('2024-01-10T00:00:00.000Z'))
  })

  it('passes AccountSchema.parse without throwing', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
