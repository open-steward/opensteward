import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ChipaxBill } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/bill'

function makeBill(overrides: Partial<ChipaxBill> = {}): ChipaxBill {
  return {
    id: 100,
    numero: 'B-001',
    proveedorId: 10,
    moneda: 'CLP',
    total: 100000,
    impuesto: 19000,
    saldo: 100000,
    fechaEmision: '2025-01-15',
    fechaVencimiento: '2025-02-15',
    estado: 'pendiente',
    anulada: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('100')
    expect(result.billNumber).toBe('B-001')
    expect(result.contactId).toBe('10')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(100000)
    expect(result.taxAmount).toBe(19000)
    expect(result.balanceAmount).toBe(100000)
  })

  it('maps voided status when anulada is true', () => {
    const result = transformBill(makeBill({ anulada: true }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps paid status when estado is pagada', () => {
    const result = transformBill(makeBill({ estado: 'pagada', saldo: 0 }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially paid status', () => {
    const result = transformBill(makeBill({ saldo: 50000, total: 100000 }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps authorized status', () => {
    const result = transformBill(makeBill({ estado: 'autorizada', saldo: 100000 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
