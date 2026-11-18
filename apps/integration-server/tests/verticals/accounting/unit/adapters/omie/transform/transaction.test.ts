import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type OmieTransaction } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/transaction'

function makeRaw(overrides: Partial<OmieTransaction> = {}): OmieTransaction {
  return {
    codigo_lancamento: 130,
    data_lancamento: '2024-11-01',
    valor: 750,
    moeda: 'BRL',
    tipo: 'DEBITO',
    conta_contabil: 5,
    referencia: 'REF-TX2',
    codigo_cliente: 9,
    nome_cliente: 'Cliente TX',
    descricao: 'Pagamento serviços',
    ...overrides,
  }
}

describe('omie transformTransaction', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformTransaction(makeRaw()).id).toBe('130')
  })

  it('maps tipo to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('DEBITO')
  })

  it('maps referencia to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-TX2')
  })

  it('maps moeda to currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('BRL')
  })

  it('maps valor to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(750)
  })

  it('maps codigo_cliente to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('9')
  })

  it('maps data_lancamento to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-11-01'))
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
