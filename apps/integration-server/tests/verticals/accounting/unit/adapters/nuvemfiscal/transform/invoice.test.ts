import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type NuvemFiscalNotaFiscal } from '../../../../../../../src/verticals/accounting/adapters/nuvemfiscal/transform/invoice'

function makeRaw(overrides: Partial<NuvemFiscalNotaFiscal> = {}): NuvemFiscalNotaFiscal {
  return {
    id_nota_fiscal: 100,
    numero_nota: 'NF-100',
    id_cliente: 3,
    nome_cliente: 'Cliente Z',
    data_emissao: '2024-06-01',
    data_vencimento: '2024-07-01',
    valor_total: 2000,
    valor_impostos: 200,
    saldo: 2000,
    moeda: 'BRL',
    contabilizada: false,
    cancelada: false,
    enviada: false,
    itens: [],
    referencia_externa: '',
    valor_pago: 0,
    ...overrides,
  }
}

describe('nuvemfiscal transformInvoice', () => {
  it('maps id_nota_fiscal to id as string', () => {
    expect(transformInvoice(makeRaw()).id).toBe('100')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps cancelada=true to VOIDED', () => {
    expect(transformInvoice(makeRaw({ cancelada: true })).status).toBe('VOIDED')
  })

  it('maps contabilizada=true with saldo=0 to PAID', () => {
    expect(transformInvoice(makeRaw({ contabilizada: true, saldo: 0 })).status).toBe('PAID')
  })

  it('maps partial saldo to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ contabilizada: true, saldo: 500, valor_total: 2000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps data_vencimento to dueAt as Date', () => {
    expect(transformInvoice(makeRaw()).dueAt).toEqual(new Date('2024-07-01'))
  })

  it('maps id_cliente to contactId as string', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformInvoice(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
