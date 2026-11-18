import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ColppyCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ColppyCreditMemo> = {}): ColppyCreditMemo {
  return {
    idNotaCredito: 300,
    nroNotaCredito: 'NC-001',
    idCliente: 10,
    nombreCliente: 'Cliente SA',
    fechaEmision: '2025-06-01',
    fechaVencimiento: '2025-07-01',
    total: 5000,
    totalIva: 1050,
    saldo: 5000,
    moneda: 'ARS',
    contabilizada: true,
    anulada: false,
    montoPagado: 0,
    items: [
      {
        idItem: 1,
        descripcion: 'Descuento',
        precioUnitario: 5000,
        cantidad: 1,
        total: 5000,
        iva: 1050,
        descuento: 0,
        idCuenta: 20,
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('300')
    expect(result.creditmemoNumber).toBe('NC-001')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(1050)
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps voided status when anulada is true', () => {
    const result = transformCreditMemo(makeCreditMemo({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status when contabilizada and saldo is zero', () => {
    const result = transformCreditMemo(makeCreditMemo({ contabilizada: true, saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps draft status when not contabilizada', () => {
    const result = transformCreditMemo(makeCreditMemo({ contabilizada: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('20')
    expect(result.lineItems![0].unitAmount).toBe(5000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
