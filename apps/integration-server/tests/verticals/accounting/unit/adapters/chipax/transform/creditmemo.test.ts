import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ChipaxCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ChipaxCreditMemo> = {}): ChipaxCreditMemo {
  return {
    id: 200,
    numero: 'NC-001',
    clienteId: 5,
    moneda: 'CLP',
    total: -50000,
    impuesto: 9500,
    saldo: 50000,
    montoPagado: 0,
    fechaEmision: '2025-03-01',
    fechaVencimiento: '2025-04-01',
    estado: 'pendiente',
    anulada: false,
    lineas: [
      {
        id: 1,
        descripcion: 'Descuento',
        cantidad: 1,
        precioUnitario: 50000,
        total: 50000,
        impuesto: 9500,
        cuentaId: '4100',
      },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('200')
    expect(result.creditmemoNumber).toBe('NC-001')
    expect(result.contactId).toBe('5')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(-50000)
    expect(result.taxAmount).toBe(9500)
    expect(result.balanceAmount).toBe(50000)
  })

  it('maps line items', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].itemDescription).toBe('Descuento')
    expect(result.lineItems![0].unitAmount).toBe(50000)
  })

  it('maps voided status when anulada is true', () => {
    const result = transformCreditMemo(makeCreditMemo({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status when saldo is 0', () => {
    const result = transformCreditMemo(makeCreditMemo({ saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid status', () => {
    const result = transformCreditMemo(makeCreditMemo({ saldo: 25000, total: -50000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
