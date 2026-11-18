import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ContabiliumBill } from '../../../../../../../src/verticals/accounting/adapters/contabilium/transform/bill'

function makeBill(overrides: Partial<ContabiliumBill> = {}): ContabiliumBill {
  return {
    id: 55,
    numero: 'F-0001',
    proveedorId: 8,
    moneda: 'ARS',
    total: 20000,
    impuestos: 4200,
    saldo: 20000,
    fechaEmision: '2024-01-15',
    fechaVencimiento: '2024-02-15',
    estado: 'Pendiente',
    anulado: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('55')
  })

  it('maps numero to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('F-0001')
  })

  it('maps proveedorId to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('8')
  })

  it('maps amounts', () => {
    const result = transformBill(makeBill())
    expect(result.totalAmount).toBe(20000)
    expect(result.taxAmount).toBe(4200)
    expect(result.balanceAmount).toBe(20000)
  })

  it('maps moneda to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('ARS')
  })

  it('maps status DRAFT for pending', () => {
    expect(transformBill(makeBill({ estado: 'Pendiente', saldo: 20000, anulado: false })).status).toBe('DRAFT')
  })

  it('maps status AUTHORIZED', () => {
    expect(transformBill(makeBill({ estado: 'Autorizado' })).status).toBe('AUTHORIZED')
  })

  it('maps status PAID when saldo=0', () => {
    expect(transformBill(makeBill({ saldo: 0 })).status).toBe('PAID')
  })

  it('maps status PAID when estado=Pagado', () => {
    expect(transformBill(makeBill({ estado: 'Pagado', saldo: 0 })).status).toBe('PAID')
  })

  it('maps status PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ saldo: 10000, total: 20000 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status VOIDED when anulado', () => {
    expect(transformBill(makeBill({ anulado: true })).status).toBe('VOIDED')
  })

  it('maps dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
