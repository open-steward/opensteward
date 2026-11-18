import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawEcwidRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawEcwidRefund> = {}): RawEcwidRefund {
  return {
    id: 5001,
    orderId: 77001,
    amount: 49.98,
    reason: 'Customer requested',
    date: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Ecwid)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('5001')
    expect(result.orderId).toBe('77001')
    expect(result.amount).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.reason).toBe('Customer requested')
    expect(result.restock).toBe(false)
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['amount']).toBe(49.98)
    expect(body['reason']).toBe('Customer requested')
  })
})
