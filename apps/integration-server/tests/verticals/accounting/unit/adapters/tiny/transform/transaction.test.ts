import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type TinyConta,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<TinyConta> = {}): TinyConta {
  return {
    id: 800,
    situacao: 'pago',
    data: '2024-07-01T00:00:00.000Z',
    dataVencimento: '2024-07-31T00:00:00.000Z',
    numeroDocumento: 'DOC-800',
    valor: 1800.0,
    historico: 'Pagamento de aluguel',
    contato: { id: 50, nome: 'Locadora Prime' },
    ...overrides,
  }
}

describe('tiny transformTransaction (PAYABLE)', () => {
  it('maps numeric id to string', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').id).toBe('800')
  })

  it('sets type to PAYABLE when passed PAYABLE', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').type).toBe('PAYABLE')
  })

  it('sets type to RECEIVABLE when passed RECEIVABLE', () => {
    expect(transformTransaction(makeRaw(), 'RECEIVABLE').type).toBe('RECEIVABLE')
  })

  it('maps numeroDocumento to reference', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').reference).toBe('DOC-800')
  })

  it('maps historico to memo', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').memo).toBe('Pagamento de aluguel')
  })

  it('maps valor to totalAmount', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').totalAmount).toBe(1800.0)
  })

  it('maps contato to contacts', () => {
    const result = transformTransaction(makeRaw(), 'PAYABLE')
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('50')
    expect(result.contacts![0].name).toBe('Locadora Prime')
  })

  it('also accepts cliente as the nested contact field', () => {
    const raw = makeRaw({ contato: undefined, cliente: { id: 99, nome: 'Cliente Alt' } })
    const result = transformTransaction(raw, 'PAYABLE')
    expect(result.contacts![0].id).toBe('99')
  })

  it('maps data to createdAt as Date', () => {
    expect(transformTransaction(makeRaw(), 'PAYABLE').createdAt).toEqual(
      new Date('2024-07-01T00:00:00.000Z'),
    )
  })

  it('passes TransactionSchema validation (PAYABLE)', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw(), 'PAYABLE'))).not.toThrow()
  })

  it('passes TransactionSchema validation (RECEIVABLE)', () => {
    expect(() =>
      TransactionSchema.parse(transformTransaction(makeRaw(), 'RECEIVABLE')),
    ).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw, 'PAYABLE').metadata).toBe(raw)
  })

  it('handles missing contact gracefully (no contacts array)', () => {
    const result = transformTransaction(makeRaw({ contato: null }), 'PAYABLE')
    expect(result.contacts).toBeUndefined()
  })
})
