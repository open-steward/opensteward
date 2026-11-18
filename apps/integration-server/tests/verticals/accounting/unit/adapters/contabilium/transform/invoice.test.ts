import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ContabiliumInvoice } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/invoice'

function makeInvoice(overrides: Partial<ContabiliumInvoice> = {}): ContabiliumInvoice {
  return {
    id: 75,
    numero: 'FA-0100',
    clienteId: 6,
    clienteNombre: 'Cliente S.A.',
    fechaEmision: '2024-01-15',
    fechaVencimiento: '2024-02-15',
    total: 25000,
    impuestos: 5250,
    saldo: 25000,
    moneda: 'ARS',
    estado: 'Pendiente',
    anulado: false,
    montoPagado: 0,
    referencia: 'REF-001',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id to string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('75')
  })

  it('maps numero to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FA-0100')
  })

  it('maps clienteId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('6')
  })

  it('maps amounts', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(25000)
    expect(result.taxAmount).toBe(5250)
    expect(result.balanceAmount).toBe(25000)
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps status DRAFT for pending', () => {
    expect(transformInvoice(makeInvoice({ estado: 'Pendiente', saldo: 25000, anulado: false })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ estado: 'Autorizado', saldo: 25000, anulado: false })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when saldo=0', () => {
    expect(transformInvoice(makeInvoice({ saldo: 0 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ saldo: 12500, total: 25000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when anulado', () => {
    expect(transformInvoice(makeInvoice({ anulado: true })).status).toBe('VOIDED')
  })

  it('maps dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('maps referencia to reference', () => {
    expect(transformInvoice(makeInvoice()).reference).toBe('REF-001')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
