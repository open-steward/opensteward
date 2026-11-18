import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type AmanoteAccount } from '../../../../../../../src/verticals/accounting/adapters/amanote/transform/account'

function makeAccount(overrides: Partial<AmanoteAccount> = {}): AmanoteAccount {
  return {
    id: 'acc-1',
    code: '1200',
    name: 'Forderungen',
    type: 'asset',
    active: true,
    description: '',
    ...overrides,
  }
}

describe('transformAccount (Amanote)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('acc-1')
    expect(result.name).toBe('Forderungen')
    expect(result.type).toBe('ASSET')
    expect(result.status).toBe('ACTIVE')
  })

  it('marks inactive as ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
