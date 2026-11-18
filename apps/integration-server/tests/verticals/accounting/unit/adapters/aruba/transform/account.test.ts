import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ArubaContoConto } from '../../../../../../../src/verticals/accounting/adapters/aruba/transform/account'

function makeAccount(overrides: Partial<ArubaContoConto> = {}): ArubaContoConto {
  return {
    id: 'ACC-001',
    codice: '3000',
    descrizione: 'Ricavi vendite',
    attivo: true,
    saldo: 50000,
    ...overrides,
  }
}

describe('transformAccount (aruba)', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('ACC-001')
    expect(result.name).toBe('Ricavi vendite')
    expect(result.customerDefinedCode).toBe('3000')
    expect(result.balance).toBe(50000)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive account to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ attivo: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
