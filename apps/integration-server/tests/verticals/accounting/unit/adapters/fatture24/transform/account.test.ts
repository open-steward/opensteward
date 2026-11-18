import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type Fatture24Conto } from '../../../../../../../src/verticals/accounting/adapters/fatture24/transform/account'

function makeAccount(overrides: Partial<Fatture24Conto> = {}): Fatture24Conto {
  return {
    id: 'ACC-001',
    Codice: '3000', Descrizione: 'Ricavi', Attivo: true, Saldo: 10000,
    ...overrides,
  }
}

describe('transformAccount (fatture24)', () => {
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
