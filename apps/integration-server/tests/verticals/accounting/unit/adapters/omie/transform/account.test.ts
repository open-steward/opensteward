import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type OmieAccount } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/account'

function makeRaw(overrides: Partial<OmieAccount> = {}): OmieAccount {
  return {
    codigo: 1,
    descricao: 'Caixa Geral',
    codigo_reduzido: 'CG01',
    ativo: 'S',
    saldo: 10000,
    tipo: 'caixa',
    ...overrides,
  }
}

describe('omie transformAccount', () => {
  it('maps codigo to id as string', () => {
    expect(transformAccount(makeRaw()).id).toBe('1')
  })

  it('maps descricao to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Caixa Geral')
  })

  it('maps codigo_reduzido to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('CG01')
  })

  it('maps ativo=S to ACTIVE', () => {
    expect(transformAccount(makeRaw({ ativo: 'S' })).status).toBe('ACTIVE')
  })

  it('maps ativo=N to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ ativo: 'N' })).status).toBe('ARCHIVED')
  })

  it('maps saldo to balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(10000)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformAccount(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
