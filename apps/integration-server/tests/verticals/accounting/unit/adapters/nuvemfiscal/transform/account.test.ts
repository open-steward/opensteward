import { describe, it, expect } from 'vitest'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'
import { transformAccount, type NuvemFiscalAccount } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/account'

function makeRaw(overrides: Partial<NuvemFiscalAccount> = {}): NuvemFiscalAccount {
  return {
    id_conta: 1,
    nome: 'Caixa',
    codigo: 'ACC-001',
    ativa: true,
    saldo: 5000,
    tipo: 'ativo',
    natureza: 'devedora',
    ...overrides,
  }
}

describe('nuvemfiscal transformAccount', () => {
  it('maps id_conta to id as string', () => {
    expect(transformAccount(makeRaw()).id).toBe('1')
  })

  it('maps nome to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Caixa')
  })

  it('maps codigo to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('ACC-001')
  })

  it('maps ativa=true to ACTIVE status', () => {
    expect(transformAccount(makeRaw({ ativa: true })).status).toBe('ACTIVE')
  })

  it('maps ativa=false to ARCHIVED status', () => {
    expect(transformAccount(makeRaw({ ativa: false })).status).toBe('ARCHIVED')
  })

  it('maps saldo to balance', () => {
    expect(transformAccount(makeRaw()).balance).toBe(5000)
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
