import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawRebillyTransaction,
} from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

// Fields from openapi/components/schemas/Transaction.yaml (Rebilly/api-definitions).
const base: RawRebillyTransaction = {
  id: 'txn_0YVDTQJ8YWDGQACV2N2N5SPWQ0',
  customerId: 'cus_0YV7DDSDD1C8DA64KHH2W33CPF',
  type: 'sale',
  status: 'completed',
  result: 'approved',
  amount: 49.99,
  currency: 'USD',
  description: 'Order 42',
  billingDescriptor: 'ACME',
  customFields: { foo: 'bar' },
  createdTime: '2026-01-15T09:30:00Z',
  updatedTime: '2026-01-15T09:31:00Z',
}

describe('rebilly transformCharge', () => {
  it('maps a completed, approved sale', () => {
    const c = ChargeSchema.parse(transformCharge(base))
    expect(c).toMatchObject({
      id: base.id,
      amount: 4999,
      currency: 'USD',
      status: 'succeeded',
      captured: true,
      customerId: base.customerId,
      statementDescriptor: 'ACME',
      metadata: { foo: 'bar' },
      updatedAt: '2026-01-15T09:31:00Z',
    })
  })

  it('scales by the currency exponent (JPY has none)', () => {
    expect(transformCharge({ ...base, amount: 1000, currency: 'JPY' }).amount).toBe(1000)
  })

  it.each([
    [{ result: 'declined' }, 'failed'],
    [{ result: 'canceled' }, 'cancelled'],
    [{ status: 'refunded' }, 'refunded'],
    [{ status: 'partially-refunded' }, 'partially_refunded'],
    [{ status: 'disputed' }, 'disputed'],
    [{ status: 'voided' }, 'cancelled'],
    [{ status: 'waiting-capture', result: 'unknown' }, 'pending'],
    [{ status: 'conn-error', result: 'unknown' }, 'unknown'],
    [{ status: 'completed', result: 'unknown' }, 'unknown'],
  ] as const)('maps %o to %s', (patch, status) => {
    const c = ChargeSchema.parse(transformCharge({ ...base, ...patch }))
    expect(c.status).toBe(status)
  })

  it('marks an authorize as not captured', () => {
    expect(transformCharge({ ...base, type: 'authorize' }).captured).toBe(false)
  })

  it('throws rather than inventing an amount or currency', () => {
    expect(() => transformCharge({ ...base, amount: undefined })).toThrow(/amount/)
    expect(() => transformCharge({ ...base, currency: undefined })).toThrow(/currency/)
    expect(() => transformCharge({ ...base, id: undefined })).toThrow(/id/)
  })

  it('drops a billingDescriptor longer than the canonical 64-char limit', () => {
    const long = 'X'.repeat(65)
    expect(
      ChargeSchema.parse(transformCharge({ ...base, billingDescriptor: long })).statementDescriptor,
    ).toBeUndefined()
    const max = 'Y'.repeat(64)
    expect(transformCharge({ ...base, billingDescriptor: max }).statementDescriptor).toBe(max)
  })
})
