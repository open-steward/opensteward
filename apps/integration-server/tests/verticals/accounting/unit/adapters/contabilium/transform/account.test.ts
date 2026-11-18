import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type ContabiliumAccount } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/account'

function makeAccount(overrides: Partial<ContabiliumAccount> = {}): ContabiliumAccount {
  return {
    id: 100,
    nombre: 'Ventas',
    codigo: '4001',
    activa: true,
    saldo: 75000,
    tipo: 'ingreso',
    ...overrides,
  }
}

describe('transformAccount', () => {
  it('maps id to string', () => {
    expect(transformAccount(makeAccount()).id).toBe('100')
  })

  it('maps codigo to customerDefinedCode', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('4001')
  })

  it('maps nombre to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Ventas')
  })

  it('maps saldo to balance', () => {
    expect(transformAccount(makeAccount()).balance).toBe(75000)
  })

  it('maps activa=true to ACTIVE status', () => {
    expect(transformAccount(makeAccount({ activa: true })).status).toBe('ACTIVE')
  })

  it('maps activa=false to ARCHIVED status', () => {
    expect(transformAccount(makeAccount({ activa: false })).status).toBe('ARCHIVED')
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
