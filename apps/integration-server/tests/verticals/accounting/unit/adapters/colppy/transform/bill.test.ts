import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ColppyBill } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/bill'

function makeBill(overrides: Partial<ColppyBill> = {}): ColppyBill {
  return {
    idFacturaProveedor: 500,
    nroFactura: 'FC-001',
    idProveedor: 10,
    nombreProveedor: 'Proveedor SA',
    total: 12100,
    iva: 2100,
    saldo: 12100,
    moneda: 'ARS',
    fechaEmision: '2025-03-01',
    fechaVencimiento: '2025-04-01',
    estado: 'autorizada',
    anulada: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('500')
    expect(result.billNumber).toBe('FC-001')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(12100)
    expect(result.taxAmount).toBe(2100)
    expect(result.balanceAmount).toBe(12100)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps voided status when anulada is true', () => {
    const result = transformBill(makeBill({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status when saldo is zero', () => {
    const result = transformBill(makeBill({ saldo: 0, total: 12100 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid status', () => {
    const result = transformBill(makeBill({ saldo: 5000, total: 12100 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps authorized status', () => {
    const result = transformBill(makeBill({ estado: 'autorizada', saldo: 12100, total: 12100 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
