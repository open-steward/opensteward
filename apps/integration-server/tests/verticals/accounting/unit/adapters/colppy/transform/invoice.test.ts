import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ColppyInvoice } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/invoice'

function makeInvoice(overrides: Partial<ColppyInvoice> = {}): ColppyInvoice {
  return {
    idFactura: 600,
    nroFactura: 'FA-0001',
    idCliente: 20,
    nombreCliente: 'Acme SA',
    fechaEmision: '2025-05-01',
    fechaVencimiento: '2025-06-01',
    total: 24200,
    totalIva: 4200,
    saldo: 24200,
    moneda: 'ARS',
    contabilizada: true,
    anulada: false,
    enviada: true,
    items: [
      {
        idItem: 1,
        codigoArticulo: 'SRV-01',
        descripcion: 'Consultoría',
        precioUnitario: 20000,
        cantidad: 1,
        total: 20000,
        iva: 4200,
        idCuenta: 50,
        descuento: 0,
        unidad: 'hora',
      },
    ],
    referenciaExterna: 'PO-9999',
    montoPagado: 0,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('600')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FA-0001')
    expect(result.contactId).toBe('20')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(24200)
    expect(result.taxAmount).toBe(4200)
    expect(result.reference).toBe('PO-9999')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps voided status', () => {
    const result = transformInvoice(makeInvoice({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status', () => {
    const result = transformInvoice(makeInvoice({ contabilizada: true, saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid status', () => {
    const result = transformInvoice(makeInvoice({ contabilizada: true, saldo: 10000, total: 24200 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps line items with itemId', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('SRV-01')
    expect(result.lineItems![0].unitAmount).toBe(20000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
