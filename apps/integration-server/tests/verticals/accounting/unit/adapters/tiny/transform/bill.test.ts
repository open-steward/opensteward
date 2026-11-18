import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/bill'
import type { TinyNotaFiscal } from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/invoice'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<TinyNotaFiscal> = {}): TinyNotaFiscal {
  return {
    id: 101,
    situacao: 2,
    tipo: 'E',
    numero: 'NF-101',
    dataEmissao: '2024-02-01T00:00:00.000Z',
    cliente: { id: 55, nome: 'Fornecedor ABC' },
    valor: 1500.0,
    valorDesconto: 50.0,
    observacoes: 'Compra de insumos',
    itens: [
      {
        idProduto: 7,
        codigo: 'PROD-007',
        descricao: 'Caneta Azul',
        quantidade: 10,
        valorUnitario: 150.0,
        valorTotal: 1500.0,
      },
    ],
    ...overrides,
  }
}

describe('tiny transformBill', () => {
  it('maps numeric id to string', () => {
    expect(transformBill(makeRaw()).id).toBe('101')
  })

  it('maps numero to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('NF-101')
  })

  it('maps cliente.id to contactId as string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('55')
  })

  it('maps situacao=2 to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ situacao: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps situacao=1 to SUBMITTED', () => {
    expect(transformBill(makeRaw({ situacao: 1 })).status).toBe('SUBMITTED')
  })

  it('maps situacao=3 to VOIDED', () => {
    expect(transformBill(makeRaw({ situacao: 3 })).status).toBe('VOIDED')
  })

  it('maps situacao=4 to DRAFT', () => {
    expect(transformBill(makeRaw({ situacao: 4 })).status).toBe('DRAFT')
  })

  it('maps situacao=6 to DELETED', () => {
    expect(transformBill(makeRaw({ situacao: 6 })).status).toBe('DELETED')
  })

  it('defaults unknown situacao to SUBMITTED', () => {
    expect(transformBill(makeRaw({ situacao: 99 })).status).toBe('SUBMITTED')
  })

  it('maps valor to totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(1500.0)
  })

  it('maps valorDesconto to discountAmount', () => {
    expect(transformBill(makeRaw()).discountAmount).toBe(50.0)
  })

  it('maps observacoes to notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Compra de insumos')
  })

  it('maps dataEmissao to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-02-01T00:00:00.000Z'))
  })

  it('maps itens to lineItems', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Caneta Azul')
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].totalAmount).toBe(1500.0)
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill({})).not.toThrow()
  })
})
