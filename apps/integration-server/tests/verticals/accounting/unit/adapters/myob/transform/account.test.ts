import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type MyobAccount } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/account'

function makeAccount(overrides: Partial<MyobAccount> = {}): MyobAccount {
  return { UID: 'uid-3', DisplayID: '1-1000', Name: 'Bank Account', Type: 'Bank', IsActive: true, CurrentBalance: 10000, ...overrides }
}

describe('transformAccount (myob)', () => {
  it('maps id, code, name', () => {
    const r = transformAccount(makeAccount())
    expect(r.id).toBe('uid-3')
    expect(r.customerDefinedCode).toBe('1-1000')
    expect(r.name).toBe('Bank Account')
  })
  it('maps balance', () => { expect(transformAccount(makeAccount()).balance).toBe(10000) })
  it('IsActive false → ARCHIVED', () => { expect(transformAccount(makeAccount({ IsActive: false })).status).toBe('ARCHIVED') })
  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
