import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type PuzzleAccount,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<PuzzleAccount> = {}): PuzzleAccount {
  return {
    id: 'pzl-acct-1',
    displayId: '4000',
    displayName: 'Sales Revenue',
    description: 'Revenue from sales',
    type: 'revenue',
    hidden: false,
    balances: {
      currentBalance: { amount: '50000.00', currency: 'USD' },
    },
    parentDisplayId: '4000-parent',
    ...overrides,
  }
}

describe('puzzle transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('pzl-acct-1')
  })

  it('maps displayName to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Sales Revenue')
  })

  it('maps displayId to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('4000')
  })

  it('maps revenue type to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'revenue' })).type).toBe('INCOME')
  })

  it('maps asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps contra_asset type to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'contra_asset' })).type).toBe('ASSET')
  })

  it('maps liability type to LIABILITY', () => {
    expect(transformAccount(makeRaw({ type: 'liability' })).type).toBe('LIABILITY')
  })

  it('maps equity type to EQUITY', () => {
    expect(transformAccount(makeRaw({ type: 'equity' })).type).toBe('EQUITY')
  })

  it('maps expense type to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps gain_or_loss type to OTHER', () => {
    expect(transformAccount(makeRaw({ type: 'gain_or_loss' })).type).toBe('OTHER')
  })

  it('maps hidden=false to ACTIVE', () => {
    expect(transformAccount(makeRaw({ hidden: false })).status).toBe('ACTIVE')
  })

  it('maps hidden=true to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ hidden: true })).status).toBe('ARCHIVED')
  })

  it('converts decimal currentBalance to minor units', () => {
    expect(transformAccount(makeRaw()).balance).toBe(5000000)
  })

  it('maps currentBalance currency', () => {
    expect(transformAccount(makeRaw()).currency).toBe('USD')
  })

  it('maps parentDisplayId to parentId', () => {
    expect(transformAccount(makeRaw()).parentId).toBe('4000-parent')
  })

  it('passes AccountSchema.parse', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })
})
