import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type EgestorVenda,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<EgestorVenda> = {}): EgestorVenda {
  return {
    codigo: 5001,
    codContato: 60,
    numNota: 'NF-2024-001',
    dtVenda: '2024-05-01',
    valorTotal: 200,
    situacao: 50,
    ativo: 1,
    produtos: [],
    financeiros: [],
    ...overrides,
  }
}

describe('egestor transformInvoice', () => {
  it('maps codigo to id as string', () => {
    const result = transformInvoice(makeRaw({ codigo: 1234 }))
    expect(result.id).toBe('1234')
  })

  it('type is always INVOICE', () => {
    const result = transformInvoice(makeRaw())
    expect(result.type).toBe('INVOICE')
  })

  it('uses numNota as invoiceNumber', () => {
    const result = transformInvoice(makeRaw({ numNota: 'NF-100' }))
    expect(result.invoiceNumber).toBe('NF-100')
  })

  it('falls back to codigo when numNota absent', () => {
    const result = transformInvoice(makeRaw({ numNota: undefined }))
    expect(result.invoiceNumber).toBe('5001')
  })

  it('maps codContato to contactId as string', () => {
    const result = transformInvoice(makeRaw({ codContato: 60 }))
    expect(result.contactId).toBe('60')
  })

  it('ativo=0 → VOIDED', () => {
    const result = transformInvoice(makeRaw({ ativo: 0 }))
    expect(result.status).toBe('VOIDED')
  })

  it('situacao=50 + empty financeiros → AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ situacao: 50, financeiros: [] }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('situacao=50 + all paid (situacao=40) → PAID', () => {
    const result = transformInvoice(
      makeRaw({
        situacao: 50,
        financeiros: [
          { codigo: 1, situacao: 40, dtVenc: '2024-06-01', dtPgto: '2024-06-01', valor: 200 },
        ],
      }),
    )
    expect(result.status).toBe('PAID')
  })

  it('situacao=50 + some paid → PARTIALLY_PAID', () => {
    const result = transformInvoice(
      makeRaw({
        situacao: 50,
        financeiros: [
          { codigo: 1, situacao: 40, valor: 100 },
          { codigo: 2, situacao: 20, valor: 100 },
        ],
      }),
    )
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('situacao=10 → DRAFT', () => {
    const result = transformInvoice(makeRaw({ situacao: 10 }))
    expect(result.status).toBe('DRAFT')
  })

  it('amounts are raw numbers', () => {
    const result = transformInvoice(makeRaw({ valorTotal: 99.98 }))
    expect(result.totalAmount).toBe(99.98)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('egestor untransformInvoice', () => {
  it('maps contactId to codContato as number', () => {
    const result = untransformInvoice({ contactId: '77' })
    expect(result.codContato).toBe(77)
  })

  it('sets situacao to 50', () => {
    const result = untransformInvoice({})
    expect(result.situacao).toBe(50)
  })

  it('maps invoiceNumber to numNota', () => {
    const result = untransformInvoice({ invoiceNumber: 'NF-999' })
    expect(result.numNota).toBe('NF-999')
  })
})
