import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ChipaxAccount } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/account'

function makeAccount(overrides: Partial<ChipaxAccount> = {}): ChipaxAccount {
  return {
    id: 1,
    nombre: 'Caja',
    codigo: '1100',
    activa: true,
    saldo: 50000,
    tipo: 'activo',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps core fields correctly', () => {
    const result = transformAccount(makeAccount())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Caja')
    expect(result.customerDefinedCode).toBe('1100')
    expect(result.balance).toBe(50000)
  })

  it('maps active status to ACTIVE', () => {
    const result = transformAccount(makeAccount({ activa: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ activa: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeAccount()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
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
