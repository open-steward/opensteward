import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type BmanConto } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/account'

function makeAccount(overrides: Partial<BmanConto> = {}): BmanConto {
  return {
    id: 'ACC-001',
    codice: '3000', descrizione: 'Ricavi', attivo: true, saldo: 10000,
    ...overrides,
  }
}

describe('transformAccount (bman)', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('ACC-001')
    expect(result.balance).toBe(10000)
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
