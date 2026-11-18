import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type TinyNotaFiscal,
} from '../../../../../../../src/verticals/accounting/adapters/tiny/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<TinyNotaFiscal> = {}): TinyNotaFiscal {
  return {
    id: 202,
    situacao: 2,
    tipo: 'S',
    numero: 'NF-202',
    dataEmissao: '2024-03-01T00:00:00.000Z',
    cliente: { id: 10, nome: 'Cliente Beta' },
    valor: 5000.0,
    valorDesconto: 100.0,
    observacoes: 'Venda de software',
    itens: [
      {
        idProduto: 3,
        codigo: 'SW-003',
        descricao: 'Licença Anual',
        quantidade: 2,
        valorUnitario: 2500.0,
        valorTotal: 5000.0,
      },
    ],
    ...overrides,
  }
}

describe('tiny transformInvoice', () => {
  it('maps numeric id to string', () => {
    expect(transformInvoice(makeRaw()).id).toBe('202')
  })

  it('maps tipo S to type INVOICE', () => {
    expect(transformInvoice(makeRaw({ tipo: 'S' })).type).toBe('INVOICE')
  })

  it('maps tipo E to type BILL', () => {
    expect(transformInvoice(makeRaw({ tipo: 'E' })).type).toBe('BILL')
  })

  it('maps situacao=2 to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ situacao: 2 })).status).toBe('AUTHORIZED')
  })

  it('maps situacao=1 to SUBMITTED', () => {
    expect(transformInvoice(makeRaw({ situacao: 1 })).status).toBe('SUBMITTED')
  })

  it('maps situacao=3 to VOIDED', () => {
    expect(transformInvoice(makeRaw({ situacao: 3 })).status).toBe('VOIDED')
  })

  it('maps situacao=7 to DRAFT', () => {
    expect(transformInvoice(makeRaw({ situacao: 7 })).status).toBe('DRAFT')
  })

  it('maps numero to invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('NF-202')
  })

  it('maps cliente.id to contactId as string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('10')
  })

  it('maps valor to totalAmount', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(5000.0)
  })

  it('maps valorDesconto to discountAmount', () => {
    expect(transformInvoice(makeRaw()).discountAmount).toBe(100.0)
  })

  it('maps observacoes to notes', () => {
    expect(transformInvoice(makeRaw()).notes).toBe('Venda de software')
  })

  it('maps dataEmissao to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
  })

  it('maps itens to lineItems', () => {
    const result = transformInvoice(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemName).toBe('Licença Anual')
    expect(result.lineItems![0].itemSku).toBe('SW-003')
    expect(result.lineItems![0].unitQuantity).toBe(2)
  })

  it('passes InvoiceSchema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformInvoice({})).not.toThrow()
  })
})
