import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type BlingContaPagar,
} from '../../../../../../../src/verticals/accounting/adapters/bling/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<BlingContaPagar> = {}): BlingContaPagar {
  return {
    id: 999,
    situacao: 1,
    valor: 1500.75,
    saldo: 1500.75,
    dataEmissao: '2024-03-01',
    vencimento: '2024-04-01',
    numeroDocumento: 'NF-001',
    historico: 'Pagamento fornecedor',
    contato: { id: 55, nome: 'Fornecedor Ltda' },
    ...overrides,
  }
}

describe('transformBill (bling)', () => {
  it('maps id to string', () => {
    const result = transformBill(makeBill({ id: 123 }))
    expect(result.id).toBe('123')
  })

  it('maps situacao=1 to AUTHORIZED', () => {
    expect(transformBill(makeBill({ situacao: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps situacao=2 to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ situacao: 2 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps situacao=3 to PAID', () => {
    expect(transformBill(makeBill({ situacao: 3 })).status).toBe('PAID')
  })

  it('maps situacao=4 to VOIDED', () => {
    expect(transformBill(makeBill({ situacao: 4 })).status).toBe('VOIDED')
  })

  it('maps situacao=5 to OVERDUE', () => {
    expect(transformBill(makeBill({ situacao: 5 })).status).toBe('OVERDUE')
  })

  it('maps situacao=undefined to DRAFT', () => {
    expect(transformBill(makeBill({ situacao: undefined })).status).toBe('DRAFT')
  })

  it('converts decimal valor to minor units', () => {
    const result = transformBill(makeBill({ valor: 1500.75, saldo: 0 }))
    expect(result.totalAmount).toBe(150075)
  })

  it('converts decimal saldo to minor units', () => {
    const result = transformBill(makeBill({ valor: 1500.75, saldo: 500.25 }))
    expect(result.balanceAmount).toBe(50025)
  })

  it('calculates paidAmount = totalAmount - balanceAmount', () => {
    const result = transformBill(makeBill({ valor: 1500.75, saldo: 500.25 }))
    expect(result.paidAmount).toBe(150075 - 50025)
  })

  it('maps contato.id to contactId as string', () => {
    const result = transformBill(makeBill({ contato: { id: 77, nome: 'Teste' } }))
    expect(result.contactId).toBe('77')
  })

  it('maps numeroDocumento to billNumber', () => {
    const result = transformBill(makeBill({ numeroDocumento: 'BOL-9876' }))
    expect(result.billNumber).toBe('BOL-9876')
  })

  it('maps historico to notes and creates lineitem', () => {
    const result = transformBill(makeBill({ historico: 'Aluguel fevereiro', valor: 200 }))
    expect(result.notes).toBe('Aluguel fevereiro')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.itemDescription).toBe('Aluguel fevereiro')
    expect(result.lineItems![0]!.totalAmount).toBe(20000)
  })

  it('omits lineItems when historico is absent', () => {
    const result = transformBill(makeBill({ historico: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps dataEmissao to postedAt Date', () => {
    const result = transformBill(makeBill({ dataEmissao: '2024-03-01' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('maps vencimento to dueAt Date', () => {
    const result = transformBill(makeBill({ vencimento: '2024-04-01' }))
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('passes raw as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('result passes BillSchema validation', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })

  it('result with minimal input passes BillSchema validation', () => {
    const result = transformBill({ id: 1 })
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
