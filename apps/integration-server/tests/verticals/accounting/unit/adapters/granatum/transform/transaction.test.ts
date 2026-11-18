import { describe, it, expect } from 'vitest'
import { transformTransaction } from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/transaction'
import type { GranatumLancamento } from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/invoice'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<GranatumLancamento> = {}): GranatumLancamento {
  return {
    id: 401,
    descricao: 'Pagamento fornecedor',
    valor: -750.5,
    data_vencimento: null,
    data_pagamento: '2024-08-10',
    data_competencia: '2024-08-10',
    documento: 'REF-4001',
    pessoa_id: 99,
    conta_id: 5,
    categoria_id: 30,
    centro_custo_lucro_id: null,
    forma_pagamento_id: 1,
    observacao: null,
    modified: '2024-08-10T15:00:00',
    ...overrides,
  }
}

describe('transformTransaction (granatum)', () => {
  it('maps id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('401')
  })

  it('maps conta_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('5')
  })

  it('maps negative valor to EXPENSE type', () => {
    expect(transformTransaction(makeTransaction({ valor: -750.5 })).type).toBe('EXPENSE')
  })

  it('maps positive valor to INCOME type', () => {
    expect(transformTransaction(makeTransaction({ valor: 500.0 })).type).toBe('INCOME')
  })

  it('converts absolute decimal valor to minor units for totalAmount', () => {
    // abs(-750.50) → 75050 centavos
    expect(transformTransaction(makeTransaction({ valor: -750.5 })).totalAmount).toBe(75050)
  })

  it('maps documento to reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('REF-4001')
  })

  it('maps descricao to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Pagamento fornecedor')
  })

  it('maps pessoa_id to contacts array', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0]!.id).toBe('99')
  })

  it('omits contacts when pessoa_id is null', () => {
    const result = transformTransaction(makeTransaction({ pessoa_id: null }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps data_competencia to createdAt', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-08-10'))
  })

  it('maps modified to updatedAt', () => {
    expect(transformTransaction(makeTransaction()).updatedAt).toEqual(
      new Date('2024-08-10T15:00:00'),
    )
  })

  it('produces a schema-valid Transaction', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTransaction()))).not.toThrow()
  })
})
