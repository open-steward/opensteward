import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type XubioCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/creditmemo'

function makeCreditMemo(overrides: Partial<XubioCreditMemo> = {}): XubioCreditMemo {
  return {
    id: 400,
    numero: 'NC-001',
    clienteId: 60,
    fechaEmision: '2025-06-01',
    fechaVencimiento: '2025-07-01',
    total: 5000,
    impuestos: 1050,
    saldo: 5000,
    montoAbonado: 0,
    moneda: 'ARS',
    estado: 'autorizado',
    anulado: false,
    lineas: [
      {
        id: 1,
        productoId: 'P-10',
        descripcion: 'Producto A',
        precioUnitario: 2500,
        cantidad: 2,
        total: 5000,
        impuesto: 1050,
        cuentaId: 'ACC-1',
        descuento: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('400')
    expect(result.creditmemoNumber).toBe('NC-001')
    expect(result.contactId).toBe('60')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1050)
    expect(result.balanceAmount).toBe(5000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps line items correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('1')
    expect(result.lineItems?.[0].itemId).toBe('P-10')
    expect(result.lineItems?.[0].unitAmount).toBe(2500)
    expect(result.lineItems?.[0].unitQuantity).toBe(2)
  })

  it('maps anulado to VOIDED', () => {
    const result = transformCreditMemo(makeCreditMemo({ anulado: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps PARTIALLY_PAID when montoAbonado > 0 and saldo > 0', () => {
    const result = transformCreditMemo(makeCreditMemo({ montoAbonado: 2000, saldo: 3000, estado: 'pendiente' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps dates correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.postedAt).toEqual(new Date('2025-06-01'))
    expect(result.dueAt).toEqual(new Date('2025-07-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
