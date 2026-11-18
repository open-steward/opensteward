import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type VhsysContaReceber,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeContaReceber(overrides: Partial<VhsysContaReceber> = {}): VhsysContaReceber {
  return {
    id_conta_receber: 77,
    id_cliente: 101,
    nome_cliente: 'Cliente XYZ',
    descricao_conta: 'Pagamento referente NF 001',
    valor_conta: '2500.00',
    valor_recebido: '2500.00',
    data_vencimento: '2024-04-15',
    data_recebimento: '2024-04-14',
    data_lancamento: '2024-03-15',
    situacao: 'R',
    moeda: 'BRL',
    forma_pagamento: 'boleto',
    numero_documento: 'NF-001',
    id_conta: '3',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeContaReceber())
    expect(result.id).toBe('77')
    expect(result.type).toBe('PAYMENT')
    expect(result.currency).toBe('BRL')
    expect(result.memo).toBe('Pagamento referente NF 001')
    expect(result.reference).toBe('NF-001')
    expect(result.paymentMethod).toBe('boleto')
    expect(result.accountId).toBe('3')
  })

  it('converts valor_conta to minor units', () => {
    const result = transformTransaction(makeContaReceber({ valor_conta: '2500.00' }))
    expect(result.totalAmount).toBe(250000)
  })

  it('maps id_cliente to contacts', () => {
    const result = transformTransaction(makeContaReceber())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('101')
    expect(result.contacts![0].name).toBe('Cliente XYZ')
  })

  it('omits contacts when id_cliente absent', () => {
    const result = transformTransaction(makeContaReceber({ id_cliente: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('defaults currency to BRL when absent', () => {
    const result = transformTransaction(makeContaReceber({ moeda: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('passes raw as metadata', () => {
    const raw = makeContaReceber()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformTransaction(makeContaReceber())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
