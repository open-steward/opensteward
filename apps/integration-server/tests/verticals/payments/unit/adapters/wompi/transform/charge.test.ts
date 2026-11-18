/**
 * Wompi transaction → canonical Charge.
 *
 * Fixtures are the documented examples:
 * - https://docs.wompi.co/docs/colombia/transacciones/ ("Response - Transacción
 *   creada", the `data` object of a Transaction, and the GET
 *   /v1/transactions/{transaction_id} "Ejemplo de respuesta");
 * - the Transaction schema of https://api.swaggerhub.com/apis/waybox/wompi/1.2.0,
 *   whose `created_at` example is "2018-07-01 23:49:45 UTC" and whose status enum
 *   is PENDING | APPROVED | DECLINED | ERROR | VOIDED.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawWompiTransaction,
} from '../../../../../../../src/verticals/payments/adapters/wompi/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

// docs.wompi.co/docs/colombia/transacciones/ — "Response - Transacción creada"
const CREATED_EXAMPLE: RawWompiTransaction = {
  id: '1292-1602113476-10985',
  reference: 'ORDER-2024-001',
  created_at: '2024-01-15T14:30:45.000Z',
  amount_in_cents: 50000,
  currency: 'COP',
  customer_email: 'juan@example.com',
  payment_method_type: 'CARD',
  status: 'PENDING',
  status_message: 'La transacción está siendo procesada',
  merchant: { id: 'pub_prod_xxx', name: 'Mi Comercio', legal_name: 'Mi Comercio SAS' },
  payment_method: { type: 'CARD', brand: 'VISA', last_four: '4242' },
}

// docs.wompi.co/docs/colombia/transacciones/ — GET /v1/transactions/{id} "Ejemplo de respuesta"
const GET_EXAMPLE: RawWompiTransaction = {
  id: '1292-1602113476-10985',
  reference: 'ORDER-2024-001',
  status: 'APPROVED',
  amount_in_cents: 50000,
  currency: 'COP',
  payment_method_type: 'CARD',
  status_message: 'Transacción aprobada',
}

describe('wompi transformCharge', () => {
  it('maps the documented created-transaction example', () => {
    const result = ChargeSchema.parse(transformCharge(CREATED_EXAMPLE))
    expect(result.id).toBe('1292-1602113476-10985')
    expect(result.externalId).toBe('1292-1602113476-10985')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('COP')
    expect(result.status).toBe('pending')
    expect(result.receiptEmail).toBe('juan@example.com')
    expect(result.createdAt).toBe('2024-01-15T14:30:45.000Z')
    expect(result.metadata).toEqual({ reference: 'ORDER-2024-001' })
    expect(result.failureMessage).toBeUndefined()
    expect(result.gateway).toBe('wompi')
    expect(result.raw).toBe(CREATED_EXAMPLE)
  })

  it('maps the documented GET example (APPROVED, no created_at)', () => {
    const result = ChargeSchema.parse(transformCharge(GET_EXAMPLE))
    expect(result.status).toBe('succeeded')
    expect(result.createdAt).toBeUndefined()
    expect(result.receiptEmail).toBeUndefined()
    expect(result.failureMessage).toBeUndefined()
  })

  it('reads the spec-example created_at form "YYYY-MM-DD HH:MM:SS UTC"', () => {
    const result = ChargeSchema.parse(
      transformCharge({ ...GET_EXAMPLE, created_at: '2018-07-01 23:49:45 UTC' }),
    )
    expect(result.createdAt).toBe('2018-07-01T23:49:45.000Z')
  })

  it.each([
    ['PENDING', 'pending'],
    ['APPROVED', 'succeeded'],
    ['DECLINED', 'failed'],
    ['ERROR', 'failed'],
    ['VOIDED', 'cancelled'],
    ['SOMETHING_NEW', 'unknown'],
  ] as const)('maps documented status %s to %s', (status, expected) => {
    const result = ChargeSchema.parse(transformCharge({ ...GET_EXAMPLE, status }))
    expect(result.status).toBe(expected)
  })

  it('carries status_message as failureMessage only for DECLINED and ERROR', () => {
    const declined = ChargeSchema.parse(
      transformCharge({
        ...GET_EXAMPLE,
        status: 'DECLINED',
        status_message: 'Fondos insuficientes',
      }),
    )
    expect(declined.failureMessage).toBe('Fondos insuficientes')
    const errored = ChargeSchema.parse(
      transformCharge({ ...GET_EXAMPLE, status: 'ERROR', status_message: 'Error interno' }),
    )
    expect(errored.failureMessage).toBe('Error interno')
  })

  it('throws instead of inventing an id, amount or currency', () => {
    const { id: _id, ...noId } = GET_EXAMPLE
    expect(() => transformCharge(noId)).toThrow(/id/)
    const { amount_in_cents: _a, ...noAmount } = GET_EXAMPLE
    expect(() => transformCharge(noAmount)).toThrow(/amount_in_cents/)
    const { currency: _c, ...noCurrency } = GET_EXAMPLE
    expect(() => transformCharge(noCurrency)).toThrow(/currency/)
  })
})
