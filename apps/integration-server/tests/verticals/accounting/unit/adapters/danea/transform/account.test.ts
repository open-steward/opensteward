import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type DaneaConto } from '../../../../../../../src/verticals/accounting/adapters/danea/transform/account'

function makeAccount(overrides: Partial<DaneaConto> = {}): DaneaConto {
  return {
    id: '1',
    Codice: '3000',
    Descrizione: 'Ricavi vendite',
    Attivo: true,
    Saldo: 10000,
    ...overrides,
  }
}

describe('transformAccount (danea)', () => {
  it('maps core fields', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Ricavi vendite')
    expect(result.customerDefinedCode).toBe('3000')
    expect(result.balance).toBe(10000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ Attivo: false })).status).toBe('ARCHIVED')
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
