import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ManagerioAccount } from '../../../../../../../src/verticals/accounting/adapters/managerio/transform/account'

function makeRaw(overrides: Partial<ManagerioAccount> = {}): ManagerioAccount {
  return { Key: 'acc-001', Code: '4000', Name: 'Sales Revenue', ControlAccount: 'Income', Active: true, ...overrides }
}

describe('transformAccount (managerio)', () => {
  it('maps core fields', () => {
    const r = transformAccount(makeRaw())
    expect(r.id).toBe('acc-001')
    expect(r.name).toBe('Sales Revenue')
    expect(r.customerDefinedCode).toBe('4000')
  })

  it('maps active=true to ACTIVE', () => { expect(transformAccount(makeRaw({ Active: true })).status).toBe('ACTIVE') })
  it('maps active=false to ARCHIVED', () => { expect(transformAccount(makeRaw({ Active: false })).status).toBe('ARCHIVED') })
  it('passes metadata unchanged', () => { const raw = makeRaw(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
