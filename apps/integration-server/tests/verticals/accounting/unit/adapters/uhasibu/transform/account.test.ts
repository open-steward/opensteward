import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type UhasibuAccount } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/account'

function makeRaw(overrides: Partial<UhasibuAccount> = {}): UhasibuAccount {
  return {
    id: 'ua-1',
    code: 'U100',
    name: 'Bank Account',
    type: 'asset',
    currency: 'KES',
    description: 'Primary bank',
    is_active: true,
    ...overrides,
  }
}

describe('uhasibu transformAccount', () => {
  it('maps id to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('ua-1')
  })

  it('maps code to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('U100')
  })

  it('maps type=asset to ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })

  it('maps type=income to INCOME', () => {
    expect(transformAccount(makeRaw({ type: 'income' })).type).toBe('INCOME')
  })

  it('maps type=expense to EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })

  it('maps is_active=false to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })

  it('maps is_active=true to ACTIVE', () => {
    expect(transformAccount(makeRaw({ is_active: true })).status).toBe('ACTIVE')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
