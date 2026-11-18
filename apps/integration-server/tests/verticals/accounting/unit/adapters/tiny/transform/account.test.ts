import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type TinyConta,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<TinyConta> = {}): TinyConta {
  return {
    id: 42,
    codigo: 'R001',
    descricao: 'Vendas de Produtos',
    tipo: 'R',
    situacao: 1,
    ...overrides,
  }
}

describe('tiny transformAccount', () => {
  it('maps numeric id to string', () => {
    expect(transformAccount(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('maps string id to string', () => {
    expect(transformAccount(makeRaw({ id: '99' })).id).toBe('99')
  })

  it('maps codigo to customerDefinedCode', () => {
    expect(transformAccount(makeRaw()).customerDefinedCode).toBe('R001')
  })

  it('maps descricao to name', () => {
    expect(transformAccount(makeRaw()).name).toBe('Vendas de Produtos')
  })

  it('maps tipo R to INCOME', () => {
    expect(transformAccount(makeRaw({ tipo: 'R' })).type).toBe('INCOME')
  })

  it('maps tipo D to EXPENSE', () => {
    expect(transformAccount(makeRaw({ tipo: 'D' })).type).toBe('EXPENSE')
  })

  it('maps unknown tipo to OTHER', () => {
    expect(transformAccount(makeRaw({ tipo: 'X' })).type).toBe('OTHER')
  })

  it('maps situacao=1 to ACTIVE', () => {
    expect(transformAccount(makeRaw({ situacao: 1 })).status).toBe('ACTIVE')
  })

  it('maps situacao=0 to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ situacao: 0 })).status).toBe('ARCHIVED')
  })

  it('maps null situacao to ARCHIVED', () => {
    expect(transformAccount(makeRaw({ situacao: null })).status).toBe('ARCHIVED')
  })

  it('passes AccountSchema validation', () => {
    expect(() => AccountSchema.parse(transformAccount(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('handles null id gracefully', () => {
    expect(transformAccount(makeRaw({ id: null })).id).toBeUndefined()
  })
})
