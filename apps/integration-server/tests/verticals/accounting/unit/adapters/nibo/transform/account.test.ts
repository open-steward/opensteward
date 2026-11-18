import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type NiboAccount } from '../../../../../../../src/verticals/accounting/adapters/nibo/transform/account'

function makeRaw(overrides: Partial<NiboAccount> = {}): NiboAccount {
  return {
    accountId: 1,
    name: 'Caixa',
    code: '1.1.01',
    isActive: true,
    balance: 0,
    type: 'asset',
    ...overrides,
  }
}

describe('nibo transformAccount', () => {
  it('maps accountId to id as string', () => {
    expect(transformAccount(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })
  it('maps isActive true -> ACTIVE', () => {
    expect(transformAccount(makeRaw({ isActive: true })).status).toBe('ACTIVE')
  })
  it('maps isActive false -> ARCHIVED', () => {
    expect(transformAccount(makeRaw({ isActive: false })).status).toBe('ARCHIVED')
  })
  it('maps name', () => {
    expect(transformAccount(makeRaw({ name: 'Banco' })).name).toBe('Banco')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
