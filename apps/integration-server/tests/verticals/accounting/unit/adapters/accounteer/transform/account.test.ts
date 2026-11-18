import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AccounteerAccount } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/account'

function makeRaw(overrides: Partial<AccounteerAccount> = {}): AccounteerAccount {
  return { id: '1', ...overrides }
}

describe('accounteer transformAccount', () => {
  it('maps id', () => {
    expect(transformAccount(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })
  it('maps type asset -> ASSET', () => {
    expect(transformAccount(makeRaw({ type: 'asset' })).type).toBe('ASSET')
  })
  it('maps type expense -> EXPENSE', () => {
    expect(transformAccount(makeRaw({ type: 'expense' })).type).toBe('EXPENSE')
  })
  it('maps is_active false -> ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ is_active: false })).status).toBe('ARCHIVED')
  })
  it('defaults status to ACTIVE when is_active is missing', () => {
    expect(transformAccount(makeRaw()).status).toBe('ACTIVE')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
