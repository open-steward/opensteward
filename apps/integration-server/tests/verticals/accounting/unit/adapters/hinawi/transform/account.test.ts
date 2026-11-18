import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type HinawiAccount } from '../../../../../../../src/verticals/accounting/adapters/hinawi/transform/account'

function makeRaw(overrides: Partial<HinawiAccount> = {}): HinawiAccount {
  return { id: '1', AccountCode: '4000', AccountName: 'Revenue', AccountType: 'Income', IsActive: true, ...overrides }
}

describe('transformAccount (hinawi)', () => {
  it('maps core fields', () => {
    const r = transformAccount(makeRaw())
    expect(r.id).toBe('1')
    expect(r.name).toBe('Revenue')
    expect(r.customerDefinedCode).toBe('4000')
  })

  it('maps IsActive=true to ACTIVE', () => { expect(transformAccount(makeRaw({ IsActive: true })).status).toBe('ACTIVE') })
  it('maps IsActive=false to ARCHIVED', () => { expect(transformAccount(makeRaw({ IsActive: false })).status).toBe('ARCHIVED') })
  it('passes metadata unchanged', () => { const raw = makeRaw(); expect(transformAccount(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
