import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type BlingContaReceber,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<BlingContaReceber> = {}): BlingContaReceber {
  return {
    id: 800,
    situacao: 1,
    valor: 2500.0,
    numeroDocumento: 'NF-1000',
    historico: 'Recebimento venda',
    contato: { id: 30, nome: 'Comprador SA' },
    contaContabil: { id: 5, descricao: 'Caixa' },
    dataEmissao: '2024-05-10',
    ...overrides,
  }
}

describe('transformTransaction (bling)', () => {
  it('maps id to string', () => {
    const result = transformTransaction(makeTransaction({ id: 123 }))
    expect(result.id).toBe('123')
  })

  it('maps situacao=3 to PAYMENT', () => {
    expect(transformTransaction(makeTransaction({ situacao: 3 })).type).toBe('PAYMENT')
  })

  it('maps situacao=4 to VOID', () => {
    expect(transformTransaction(makeTransaction({ situacao: 4 })).type).toBe('VOID')
  })

  it('maps situacao=1 to RECEIVABLE (default)', () => {
    expect(transformTransaction(makeTransaction({ situacao: 1 })).type).toBe('RECEIVABLE')
  })

  it('maps situacao=2 to RECEIVABLE (default)', () => {
    expect(transformTransaction(makeTransaction({ situacao: 2 })).type).toBe('RECEIVABLE')
  })

  it('maps situacao=5 to RECEIVABLE (default)', () => {
    expect(transformTransaction(makeTransaction({ situacao: 5 })).type).toBe('RECEIVABLE')
  })

  it('maps situacao=undefined to RECEIVABLE (default)', () => {
    expect(transformTransaction(makeTransaction({ situacao: undefined })).type).toBe('RECEIVABLE')
  })

  it('maps contaContabil.id to accountId as string', () => {
    const result = transformTransaction(
      makeTransaction({ contaContabil: { id: 12, descricao: 'Banco' } }),
    )
    expect(result.accountId).toBe('12')
  })

  it('maps numeroDocumento to reference', () => {
    const result = transformTransaction(makeTransaction({ numeroDocumento: 'REF-555' }))
    expect(result.reference).toBe('REF-555')
  })

  it('maps historico to memo', () => {
    const result = transformTransaction(makeTransaction({ historico: 'Pagamento parcial' }))
    expect(result.memo).toBe('Pagamento parcial')
  })

  it('converts valor to minor units', () => {
    const result = transformTransaction(makeTransaction({ valor: 1234.56 }))
    expect(result.totalAmount).toBe(123456)
  })

  it('maps contato to contacts array', () => {
    const result = transformTransaction(
      makeTransaction({ contato: { id: 99, nome: 'Cliente VIP' } }),
    )
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0]!.id).toBe('99')
    expect(result.contacts![0]!.name).toBe('Cliente VIP')
  })

  it('includes contact when only nome is present (no id)', () => {
    const result = transformTransaction(
      makeTransaction({ contato: { id: undefined, nome: 'Anon Cliente' } }),
    )
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0]!.name).toBe('Anon Cliente')
    expect(result.contacts![0]!.id).toBeUndefined()
  })

  it('omits contacts when contato has no id or nome', () => {
    const result = transformTransaction(
      makeTransaction({ contato: { id: undefined, nome: undefined } }),
    )
    expect(result.contacts).toBeUndefined()
  })

  it('omits contacts when contato is absent', () => {
    const result = transformTransaction(makeTransaction({ contato: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps dataEmissao to createdAt Date', () => {
    const result = transformTransaction(makeTransaction({ dataEmissao: '2024-05-10' }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('result passes TransactionSchema validation', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes TransactionSchema validation', () => {
    const result = transformTransaction({ id: 1 })
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
