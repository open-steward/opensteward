import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ChipaxInvoice } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/invoice'

function makeInvoice(overrides: Partial<ChipaxInvoice> = {}): ChipaxInvoice {
  return {
    id: 400,
    numero: 'F-001',
    clienteId: 15,
    clienteNombre: 'Cliente SA',
    fechaEmision: '2025-01-20',
    fechaVencimiento: '2025-02-20',
    total: 200000,
    impuesto: 38000,
    saldo: 200000,
    moneda: 'CLP',
    estado: 'pendiente',
    anulada: false,
    montoPagado: 0,
    referencia: 'OC-100',
    lineas: [
      {
        id: 1,
        productoId: 'PROD-1',
        descripcion: 'Servicio consultoría',
        precioUnitario: 200000,
        cantidad: 1,
        total: 200000,
        impuesto: 38000,
        cuentaId: '4100',
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('400')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('F-001')
    expect(result.contactId).toBe('15')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(200000)
    expect(result.taxAmount).toBe(38000)
    expect(result.reference).toBe('OC-100')
  })

  it('maps line items with discount', () => {
    const result = transformInvoice(makeInvoice({
      lineas: [{
        id: 2, productoId: 'P-2', descripcion: 'Item', precioUnitario: 100, cantidad: 2,
        total: 180, impuesto: 0, cuentaId: '4100', descuento: 20,
      }],
    }))
    expect(result.lineItems![0].discountAmount).toBe(20)
  })

  it('maps voided status', () => {
    const result = transformInvoice(makeInvoice({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status', () => {
    const result = transformInvoice(makeInvoice({ estado: 'pagada', saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid status', () => {
    const result = transformInvoice(makeInvoice({ saldo: 100000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
