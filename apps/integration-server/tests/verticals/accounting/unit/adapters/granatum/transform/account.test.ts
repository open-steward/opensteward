import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type GranatumConta,
} from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<GranatumConta> = {}): GranatumConta {
  return {
    id: 5,
    descricao: 'Conta Corrente Bradesco',
    permite_lancamento: true,
    ativo: true,
    saldo: 2500.75,
    banco_id: 237,
    agencia: '1234',
    numero: '00001-5',
    ...overrides,
  }
}

describe('transformAccount (granatum)', () => {
  it('maps id as string', () => {
    expect(transformAccount(makeAccount()).id).toBe('5')
  })

  it('maps descricao to name', () => {
    expect(transformAccount(makeAccount()).name).toBe('Conta Corrente Bradesco')
  })

  it('type is always ASSET', () => {
    expect(transformAccount(makeAccount()).type).toBe('ASSET')
  })

  it('maps ativo=true to ACTIVE', () => {
    expect(transformAccount(makeAccount({ ativo: true })).status).toBe('ACTIVE')
  })

  it('maps ativo=false to ARCHIVED', () => {
    expect(transformAccount(makeAccount({ ativo: false })).status).toBe('ARCHIVED')
  })

  it('converts decimal BRL saldo to minor units (centavos)', () => {
    // 2500.75 → 250075
    expect(transformAccount(makeAccount({ saldo: 2500.75 })).balance).toBe(250075)
  })

  it('returns undefined balance when saldo is undefined', () => {
    const raw = makeAccount()
    delete raw.saldo
    expect(transformAccount(raw).balance).toBeUndefined()
  })

  it('sets customerDefinedCode to string id', () => {
    expect(transformAccount(makeAccount()).customerDefinedCode).toBe('5')
  })

  it('handles string saldo values', () => {
    expect(transformAccount(makeAccount({ saldo: '100.50' })).balance).toBe(10050)
  })

  it('produces a schema-valid Account', () => {
    expect(() => AccountSchema.parse(transformAccount(makeAccount()))).not.toThrow()
  })
})
