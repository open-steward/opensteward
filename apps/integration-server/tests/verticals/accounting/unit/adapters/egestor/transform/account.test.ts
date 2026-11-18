import { describe, it, expect } from 'vitest'
import {
  transformAccount,
  type EgestorPlanoContas,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/account'
import { AccountSchema } from '../../../../../../../src/verticals/accounting/schema/account'

function makeRaw(overrides: Partial<EgestorPlanoContas> = {}): EgestorPlanoContas {
  return {
    codigo: 1001,
    nome: 'Sales Revenue',
    tipo: 1,
    codPai: 1000,
    ...overrides,
  }
}

describe('egestor transformAccount', () => {
  it('maps codigo to id as string', () => {
    const result = transformAccount(makeRaw({ codigo: 4000 }))
    expect(result.id).toBe('4000')
    expect(result.customerDefinedCode).toBe('4000')
  })

  it('tipo=1 → INCOME', () => {
    const result = transformAccount(makeRaw({ tipo: 1 }))
    expect(result.type).toBe('INCOME')
  })

  it('tipo=2 → EXPENSE', () => {
    const result = transformAccount(makeRaw({ tipo: 2 }))
    expect(result.type).toBe('EXPENSE')
  })

  it('tipo=undefined → type undefined', () => {
    const result = transformAccount(makeRaw({ tipo: undefined }))
    expect(result.type).toBeUndefined()
  })

  it('status is always ACTIVE', () => {
    const result = transformAccount(makeRaw())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps codPai to parentId as string', () => {
    const result = transformAccount(makeRaw({ codPai: 500 }))
    expect(result.parentId).toBe('500')
  })

  it('codPai=undefined → parentId undefined', () => {
    const result = transformAccount(makeRaw({ codPai: undefined }))
    expect(result.parentId).toBeUndefined()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformAccount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes AccountSchema.parse without throwing', () => {
    const result = transformAccount(makeRaw())
    expect(() => AccountSchema.parse(result)).not.toThrow()
  })
})
