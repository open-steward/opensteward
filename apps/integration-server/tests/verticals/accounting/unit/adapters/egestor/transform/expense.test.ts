import { describe, it, expect } from 'vitest'
import { expectDate } from '../../../../../../date-assertions'
import {
  transformExpense,
  type EgestorPagamentoExpense,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<EgestorPagamentoExpense> = {}): EgestorPagamentoExpense {
  return {
    codigo: 4001,
    descricao: 'Office supplies',
    valor: 49.99,
    dtVenc: '2024-04-30',
    dtCad: '2024-04-01',
    situacao: 10,
    codContato: 55,
    ...overrides,
  }
}

describe('egestor transformExpense', () => {
  it('maps codigo to id as string', () => {
    const result = transformExpense(makeRaw({ codigo: 7777 }))
    expect(result.id).toBe('7777')
  })

  it('maps descricao to name', () => {
    const result = transformExpense(makeRaw({ descricao: 'Travel' }))
    expect(result.name).toBe('Travel')
  })

  it('maps valor to totalAmount as integer minor units', () => {
    const result = transformExpense(makeRaw({ valor: 149.5 }))
    expect(result.totalAmount).toBe(14950)
  })

  it('maps codContato to contactId as string', () => {
    const result = transformExpense(makeRaw({ codContato: 55 }))
    expect(result.contactId).toBe('55')
  })

  it('uses dtPgto as postedAt when present', () => {
    const result = transformExpense(makeRaw({ dtPgto: '2024-04-15', dtVenc: '2024-04-30' }))
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(expectDate(result.postedAt).toISOString()).toContain('2024-04-15')
  })

  it('falls back to dtVenc as postedAt when dtPgto absent', () => {
    const result = transformExpense(makeRaw({ dtPgto: undefined, dtVenc: '2024-04-30' }))
    expect(expectDate(result.postedAt).toISOString()).toContain('2024-04-30')
  })

  it('maps dtCad to createdAt as Date', () => {
    const result = transformExpense(makeRaw({ dtCad: '2024-04-01' }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse with totalAmount as integer minor units', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
