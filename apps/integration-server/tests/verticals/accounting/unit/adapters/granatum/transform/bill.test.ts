import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/bill'
import type { GranatumLancamento } from '../../../../../../../src/verticals/accounting/adapters/granatum/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<GranatumLancamento> = {}): GranatumLancamento {
  return {
    id: 201,
    descricao: 'Aluguel escritório',
    valor: -3000.0,
    data_vencimento: '2099-12-31',
    data_pagamento: null,
    data_competencia: '2024-06-01',
    documento: 'DOC-2024-06',
    pessoa_id: 88,
    conta_id: 5,
    categoria_id: 10,
    centro_custo_lucro_id: null,
    forma_pagamento_id: 1,
    observacao: 'Office rent June',
    modified: '2024-06-01T08:00:00',
    ...overrides,
  }
}

describe('transformBill (granatum)', () => {
  it('maps id as string', () => {
    expect(transformBill(makeBill()).id).toBe('201')
  })

  it('maps documento to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('DOC-2024-06')
  })

  it('maps pessoa_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('88')
  })

  it('takes absolute value of negative valor for totalAmount', () => {
    // -3000.00 → abs → 300000 centavos
    expect(transformBill(makeBill({ valor: -3000.0 })).totalAmount).toBe(300000)
  })

  it('maps data_pagamento set → PAID status', () => {
    const result = transformBill(makeBill({ data_pagamento: '2024-05-31' }))
    expect(result.status).toBe('PAID')
  })

  it('maps future data_vencimento with no payment → AUTHORIZED', () => {
    expect(transformBill(makeBill()).status).toBe('AUTHORIZED')
  })

  it('maps past data_vencimento with no payment → OVERDUE', () => {
    const result = transformBill(makeBill({ data_vencimento: '2000-01-01', data_pagamento: null }))
    expect(result.status).toBe('OVERDUE')
  })

  it('maps data_competencia to postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps data_vencimento to dueAt', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2099-12-31'))
  })

  it('maps observacao to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Office rent June')
  })

  it('maps modified to updatedAt', () => {
    expect(transformBill(makeBill()).updatedAt).toEqual(new Date('2024-06-01T08:00:00'))
  })

  it('produces a schema-valid Bill', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
