import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type VhsysContaPagar,
} from '../../../../../../../src/verticals/accounting/adapters/vhsys/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<VhsysContaPagar> = {}): VhsysContaPagar {
  return {
    id_conta_pagar: 55,
    id_fornecedor: 202,
    descricao_conta: 'Aluguel do escritório',
    valor_conta: '3000.00',
    valor_pago: '0',
    data_vencimento: '2024-04-10',
    data_pagamento: undefined,
    data_lancamento: '2024-03-10',
    situacao: 'A',
    numero_documento: 'NF-001',
    moeda: 'BRL',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('55')
    expect(result.contactId).toBe('supp_202')
    expect(result.currency).toBe('BRL')
    expect(result.notes).toBe('Aluguel do escritório')
    expect(result.billNumber).toBe('NF-001')
  })

  it('converts valor_conta to minor units', () => {
    const result = transformBill(makeBill({ valor_conta: '3000.00' }))
    expect(result.totalAmount).toBe(300000)
  })

  it('maps situacao A with no payment to AUTHORIZED', () => {
    const result = transformBill(makeBill({ situacao: 'A', valor_pago: '0' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps situacao A with partial payment to PARTIALLY_PAID', () => {
    const result = transformBill(
      makeBill({ situacao: 'A', valor_conta: '1000', valor_pago: '400' }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps situacao P to PAID', () => {
    const result = transformBill(makeBill({ situacao: 'P' }))
    expect(result.status).toBe('PAID')
  })

  it('maps situacao C to VOIDED', () => {
    const result = transformBill(makeBill({ situacao: 'C' }))
    expect(result.status).toBe('VOIDED')
  })

  it('prefixes contactId with supp_', () => {
    const result = transformBill(makeBill({ id_fornecedor: 99 }))
    expect(result.contactId).toBe('supp_99')
  })

  it('computes balanceAmount as total minus paid', () => {
    const result = transformBill(makeBill({ valor_conta: '2000.00', valor_pago: '500.00' }))
    expect(result.totalAmount).toBe(200000)
    expect(result.paidAmount).toBe(50000)
    expect(result.balanceAmount).toBe(150000)
  })

  it('passes raw as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
