import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type VhsysContaPagarDespesa,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeDespesa(overrides: Partial<VhsysContaPagarDespesa> = {}): VhsysContaPagarDespesa {
  return {
    id_conta_pagar: 88,
    id_fornecedor: 202,
    descricao_conta: 'Material de escritório',
    valor_conta: '450.00',
    data_lancamento: '2024-06-01',
    data_vencimento: '2024-06-30',
    moeda: 'BRL',
    forma_pagamento: 'cartao',
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('maps core fields correctly', () => {
    const result = transformExpense(makeDespesa())
    expect(result.id).toBe('88')
    expect(result.name).toBe('Material de escritório')
    expect(result.contactId).toBe('supp_202')
    expect(result.currency).toBe('BRL')
    expect(result.paymentMethod).toBe('cartao')
  })

  it('converts valor_conta to minor units', () => {
    const result = transformExpense(makeDespesa({ valor_conta: '450.00' }))
    expect(result.totalAmount).toBe(45000)
  })

  it('prefixes contactId with supp_', () => {
    const result = transformExpense(makeDespesa({ id_fornecedor: 55 }))
    expect(result.contactId).toBe('supp_55')
  })

  it('defaults currency to BRL when absent', () => {
    const result = transformExpense(makeDespesa({ moeda: undefined }))
    expect(result.currency).toBe('BRL')
  })

  it('passes raw as metadata', () => {
    const raw = makeDespesa()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformExpense(makeDespesa())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
