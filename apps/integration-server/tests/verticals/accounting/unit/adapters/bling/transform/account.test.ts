import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type BlingContaContabil,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeAccount(overrides: Partial<BlingContaContabil> = {}): BlingContaContabil {
  return {
    id: 101,
    descricao: 'Caixa e Equivalentes',
    situacao: 1,
    ...overrides,
  }
}

describe('transformAccount (bling)', () => {
  it('maps id to string', () => {
    const result = transformAccount(makeAccount({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps descricao to name', () => {
    const result = transformAccount(makeAccount({ descricao: 'Receitas de Vendas' }))
    expect(result.name).toBe('Receitas de Vendas')
  })

  it('maps situacao=1 to ACTIVE', () => {
    const result = transformAccount(makeAccount({ situacao: 1 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps situacao=2 to ARCHIVED', () => {
    const result = transformAccount(makeAccount({ situacao: 2 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps situacao=undefined to ACTIVE', () => {
    const result = transformAccount(makeAccount({ situacao: undefined }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps any situacao other than 2 to ACTIVE', () => {
    const result = transformAccount(makeAccount({ situacao: 5 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('omits name when descricao is undefined', () => {
    const result = transformAccount(makeAccount({ descricao: undefined }))
    expect(result.name).toBeUndefined()
  })

  it('passes raw as metadata', () => {
    const raw = makeAccount()
    expect(transformAccount(raw).metadata).toBe(raw)
  })

  it('result passes AccountSchema validation', () => {
    const result = transformAccount(makeAccount())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes AccountSchema validation', () => {
    const result = transformAccount({ id: 1 })
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
