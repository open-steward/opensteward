import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type XubioAccount } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/account'

function makeAccount(overrides: Partial<XubioAccount> = {}): XubioAccount {
  return {
    id: 101,
    nombre: 'Caja General',
    codigo: 'CG-001',
    activo: true,
    saldo: 50000.75,
    tipo: 'activo',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('101')
    expect(result.name).toBe('Caja General')
    expect(result.customerDefinedCode).toBe('CG-001')
    expect(result.balance).toBe(5000075)
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount({ extra: 'data' })
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps activo true to ACTIVE status', () => {
    const result = transformAccount(makeAccount({ activo: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps activo false to ARCHIVED status', () => {
    const result = transformAccount(makeAccount({ activo: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('falls back to id for customerDefinedCode when codigo is empty', () => {
    const result = transformAccount(makeAccount({ codigo: '' }))
    expect(result.customerDefinedCode).toBe('101')
  })

  it('returns undefined name when nombre is empty', () => {
    const result = transformAccount(makeAccount({ nombre: '' }))
    expect(result.name).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
