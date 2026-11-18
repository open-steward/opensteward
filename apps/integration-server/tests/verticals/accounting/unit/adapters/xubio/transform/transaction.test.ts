import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type XubioTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/xubio/transform/transaction'

function makeTransaction(overrides: Partial<XubioTransaction> = {}): XubioTransaction {
  return {
    id: 55,
    fecha: '2024-01-15',
    monto: 3200,
    moneda: 'ARS',
    tipo: 'PAYMENT',
    cuentaId: 101,
    referencia: 'REF-2024',
    contactoId: 20,
    contactoNombre: 'Proveedor XYZ',
    descripcion: 'Pago a proveedor',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id as string', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('55')
  })

  it('maps cuentaId to accountId as string', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.accountId).toBe('101')
  })

  it('maps tipo to type', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.type).toBe('PAYMENT')
  })

  it('maps referencia to reference', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.reference).toBe('REF-2024')
  })

  it('maps moneda to currency', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.currency).toBe('ARS')
  })

  it('maps monto to totalAmount', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.totalAmount).toBe(3200)
  })

  it('parses fecha as createdAt Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('maps contactoId and contactoNombre to contacts', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('20')
    expect(result.contacts![0].name).toBe('Proveedor XYZ')
  })

  it('sets contacts to undefined when contactoId is 0', () => {
    const result = transformTransaction(makeTransaction({ contactoId: 0 }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps lineitem with account and amount', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('101')
    expect(result.lineItems![0].totalAmount).toBe(3200)
    expect(result.lineItems![0].name).toBe('Pago a proveedor')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
