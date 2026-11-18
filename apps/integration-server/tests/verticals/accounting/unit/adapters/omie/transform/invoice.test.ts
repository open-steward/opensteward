import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type OmieInvoice } from '../../../../../../../src/verticals/accounting/adapters/omie/transform/invoice'

function makeRaw(overrides: Partial<OmieInvoice> = {}): OmieInvoice {
  return {
    codigo_lancamento: 60,
    numero_nota: 'NF-060',
    codigo_cliente: 8,
    nome_cliente: 'Cliente Omie',
    data_emissao: '2024-07-01',
    data_vencimento: '2024-08-01',
    valor_total: 3000,
    valor_imposto: 300,
    saldo: 3000,
    valor_pago: 0,
    moeda: 'BRL',
    status: 'ABERTO',
    cancelada: 'N',
    itens: [],
    referencia: '',
    ...overrides,
  }
}

describe('omie transformInvoice', () => {
  it('maps codigo_lancamento to id as string', () => {
    expect(transformInvoice(makeRaw()).id).toBe('60')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeRaw()).type).toBe('INVOICE')
  })

  it('maps cancelada=S to VOIDED', () => {
    expect(transformInvoice(makeRaw({ cancelada: 'S' })).status).toBe('VOIDED')
  })

  it('maps status=PAGO to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'PAGO' })).status).toBe('PAID')
  })

  it('maps partial saldo to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ saldo: 1000, valor_total: 3000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status=AUTORIZADO to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'AUTORIZADO', saldo: 3000 })).status).toBe('AUTHORIZED')
  })

  it('maps data_emissao to postedAt as Date', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps data_vencimento to dueAt as Date', () => {
    expect(transformInvoice(makeRaw()).dueAt).toEqual(new Date('2024-08-01'))
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
