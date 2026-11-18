import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type XubioBill } from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/bill'

function makeBill(overrides: Partial<XubioBill> = {}): XubioBill {
  return {
    id: 200,
    numero: 'B-001',
    proveedorId: 50,
    fechaEmision: '2025-03-01',
    fechaVencimiento: '2025-04-01',
    total: 10000,
    impuestos: 2100,
    saldo: 10000,
    moneda: 'ARS',
    estado: 'autorizado',
    anulado: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('200')
    expect(result.billNumber).toBe('B-001')
    expect(result.contactId).toBe('50')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(2100)
    expect(result.balanceAmount).toBe(10000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps anulado to VOIDED', () => {
    const result = transformBill(makeBill({ anulado: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps estado pagado to PAID', () => {
    const result = transformBill(makeBill({ estado: 'pagado', saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partial payment to PARTIALLY_PAID', () => {
    const result = transformBill(makeBill({ saldo: 5000, total: 10000, estado: 'pendiente' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps estado autorizado to AUTHORIZED', () => {
    const result = transformBill(makeBill({ estado: 'autorizado', saldo: 10000, total: 10000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps dates correctly', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2025-03-01'))
    expect(result.dueAt).toEqual(new Date('2025-04-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
