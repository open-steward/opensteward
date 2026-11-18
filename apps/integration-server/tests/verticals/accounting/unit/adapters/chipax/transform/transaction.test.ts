import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ChipaxTransaction } from '../../../../../../../src/verticals/accounting/adapters/chipax/transform/transaction'

function makeTransaction(overrides: Partial<ChipaxTransaction> = {}): ChipaxTransaction {
  return {
    id: 900,
    cuentaId: '1100',
    tipo: 'ingreso',
    referencia: 'PAG-001',
    moneda: 'CLP',
    monto: 120000,
    fechaPago: '2025-03-15',
    contactoId: 10,
    contactoNombre: 'Cliente SA',
    lineas: [],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('900')
    expect(result.accountId).toBe('1100')
    expect(result.type).toBe('ingreso')
    expect(result.reference).toBe('PAG-001')
    expect(result.currency).toBe('CLP')
    expect(result.totalAmount).toBe(120000)
  })

  it('maps contacts when contactoId is present', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('10')
    expect(result.contacts![0].name).toBe('Cliente SA')
  })

  it('returns undefined contacts when contactoId is 0', () => {
    const result = transformTransaction(makeTransaction({ contactoId: 0 }))
    expect(result.contacts).toBeUndefined()
  })

  it('falls back to single lineitem from main fields when lineas is empty', () => {
    const result = transformTransaction(makeTransaction({ lineas: [] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('1100')
    expect(result.lineItems?.[0].totalAmount).toBe(120000)
  })

  it('uses lineas when provided', () => {
    const result = transformTransaction(makeTransaction({
      lineas: [
        { cuentaId: '1100', nombre: 'Caja', descripcion: 'Pago', monto: 120000 },
      ],
    }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].name).toBe('Caja')
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
