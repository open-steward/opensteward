import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type EvolizAccount } from '../../../../../../../src/verticals/accounting/adapters/evoliz/transform/account'

function makeAccount(overrides: Partial<EvolizAccount> = {}): EvolizAccount {
  return {
    id: '1',
    account_code: '706000',
    label: 'Ventes de prestations',
    active: true,
    balance: 8000,
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Ventes de prestations')
    expect(result.customerDefinedCode).toBe('706000')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ active: false })).status).toBe('ARCHIVED')
  })

  it('metadata identity', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
