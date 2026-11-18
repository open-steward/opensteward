import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type PagaAccount } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/account'

function makeRaw(overrides: Partial<PagaAccount> = {}): PagaAccount {
  return {
    accountNumber: 'ACC-001',
    accountName: 'Main Wallet',
    balance: 5000,
    currency: 'NGN',
    ...overrides,
  }
}

describe('paga transformAccount', () => {
  it('maps accountNumber to id', () => {
    expect(transformAccount(makeRaw()).id).toBe('ACC-001')
  })

  it('maps accountName to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Main Wallet')
  })

  it('maps balance to balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(5000)
  })

  it('maps currency to currency', () => {
    expect(transformAccount(makeRaw()).currency).toBe('NGN')
  })

  it('defaults currency to NGN when not provided', () => {
    expect(transformAccount(makeRaw({ currency: undefined })).currency).toBe('NGN')
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
