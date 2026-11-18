import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ColppyMovimiento } from '../../../../../../../src/verticals/accounting/adapters/colppy/transform/transaction'

function makeTransaction(overrides: Partial<ColppyMovimiento> = {}): ColppyMovimiento {
  return {
    idMovimiento: 1100,
    idCuenta: 10,
    tipo: 'cobro',
    referencia: 'TRX-001',
    moneda: 'ARS',
    monto: 24200,
    fecha: '2025-05-15',
    idCliente: 20,
    nombreCliente: 'Acme SA',
    detalles: [
      {
        idCuenta: 50,
        nombre: 'Ventas',
        descripcion: 'Cobro factura FA-0001',
        monto: 24200,
      },
    ],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('1100')
    expect(result.accountId).toBe('10')
    expect(result.type).toBe('cobro')
    expect(result.reference).toBe('TRX-001')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(24200)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps contacts when idCliente is present', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('20')
    expect(result.contacts![0].name).toBe('Acme SA')
  })

  it('returns undefined contacts when no idCliente', () => {
    const result = transformTransaction(makeTransaction({ idCliente: 0 }))
    expect(result.contacts).toBeUndefined()
  })

  it('builds lineItems from main record and detalles', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].name).toBe('cobro')
    expect(result.lineItems![1].description).toBe('Cobro factura FA-0001')
  })

  it('maps createdAt date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2025-05-15'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
