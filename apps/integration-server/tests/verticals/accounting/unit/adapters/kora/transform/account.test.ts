import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type KoraStubAccount } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/account'

function makeRaw(overrides: KoraStubAccount = {}): KoraStubAccount {
  return { ...overrides }
}

describe('kora transformAccount', () => {
  it('handles empty object gracefully', () => {
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
