import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type XubioInvoice } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/invoice'

function makeInvoice(overrides: Partial<XubioInvoice> = {}): XubioInvoice {
  return {
    id: 600,
    numero: 'FA-0001',
    clienteId: 80,
    clienteNombre: 'Cliente SA',
    fechaEmision: '2025-04-01',
    fechaVencimiento: '2025-05-01',
    total: 15000,
    impuestos: 3150,
    saldo: 15000,
    montoAbonado: 0,
    moneda: 'ARS',
    estado: 'autorizado',
    anulado: false,
    lineas: [
      {
        id: 1,
        productoId: 'P-20',
        descripcion: 'Servicio consultoría',
        precioUnitario: 5000,
        cantidad: 3,
        total: 15000,
        impuesto: 3150,
        cuentaId: 'ACC-10',
        descuento: 0,
      },
    ],
    referencia: 'REF-2025-001',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('600')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FA-0001')
    expect(result.contactId).toBe('80')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(15000)
    expect(result.taxAmount).toBe(3150)
    expect(result.reference).toBe('REF-2025-001')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps anulado to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ anulado: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps PAID when saldo is 0', () => {
    const result = transformInvoice(makeInvoice({ saldo: 0, estado: 'pagado' }))
    expect(result.status).toBe('PAID')
  })

  it('maps PARTIALLY_PAID when partial balance', () => {
    const result = transformInvoice(makeInvoice({ saldo: 5000, total: 15000, estado: 'pendiente' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps line items correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].unitAmount).toBe(5000)
    expect(result.lineItems?.[0].unitQuantity).toBe(3)
    expect(result.lineItems?.[0].itemId).toBe('P-20')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
