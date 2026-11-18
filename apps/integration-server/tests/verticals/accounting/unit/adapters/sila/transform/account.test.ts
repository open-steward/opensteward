import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type SilaWallet } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/account'

function makeRaw(overrides: Partial<SilaWallet> = {}): SilaWallet {
  return {
    nickname: 'My Wallet',
    blockchain_address: '0xABC123',
    balance: 2000,
    ...overrides,
  }
}

describe('sila transformAccount', () => {
  it('maps blockchain_address to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('0xABC123')
  })

  it('maps nickname to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('My Wallet')
  })

  it('maps balance to balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(2000)
  })

  it('sets currency to USD', () => {
    expect(transformAccount(makeRaw()).currency).toBe('USD')
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
