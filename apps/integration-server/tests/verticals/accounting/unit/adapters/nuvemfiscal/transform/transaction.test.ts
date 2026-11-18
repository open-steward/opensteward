import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type NuvemFiscalMovimentacao } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/transaction'

function makeRaw(overrides: Partial<NuvemFiscalMovimentacao> = {}): NuvemFiscalMovimentacao {
  return {
    id_movimentacao: 77,
    id_conta: 11,
    tipo: 'CREDITO',
    referencia: 'REF-TX',
    moeda: 'BRL',
    valor: 250,
    data_movimentacao: '2024-10-01',
    id_cliente: 5,
    nome_cliente: 'Cliente C',
    detalhes: [],
    ...overrides,
  }
}

describe('nuvemfiscal transformTransaction', () => {
  it('maps id_movimentacao to id as string', () => {
    expect(transformTransaction(makeRaw()).id).toBe('77')
  })

  it('maps tipo to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('CREDITO')
  })

  it('maps referencia to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-TX')
  })

  it('maps moeda to currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('BRL')
  })

  it('maps valor to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(250)
  })

  it('maps id_cliente to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('5')
  })

  it('maps data_movimentacao to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-10-01'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
