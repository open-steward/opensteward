import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/kushki/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { REFUND_ROW } from '../fixtures'

describe('kushki transformRefund (transactions-list REFUND row)', () => {
  it('maps a REFUND row to its sale by sale_ticket_number', () => {
    const r = RefundSchema.parse(transformRefund(REFUND_ROW))
    expect(r.id).toBe('661738684712571670')
    expect(r.chargeId).toBe('029184246439606168')
    expect(r.amount).toBe(50000)
    expect(r.currency).toBe('MXN')
    expect(r.status).toBe('succeeded')
    expect(r.createdAt).toBe('2025-02-04T15:58:44.302Z')
    expect(r.metadata).toEqual({ contractID: '157AB' })
  })

  it('maps APPROVAL to succeeded and INITIALIZED to pending, with no failureReason', () => {
    const ok = transformRefund({ ...REFUND_ROW, transaction_status: 'APPROVAL' })
    expect(ok.status).toBe('succeeded')
    expect(ok.failureReason).toBeUndefined()
    const pending = transformRefund({ ...REFUND_ROW, transaction_status: 'INITIALIZED' })
    expect(pending.status).toBe('pending')
    expect(pending.failureReason).toBeUndefined()
  })

  it('takes amount from request_amount, not approved_transaction_amount', () => {
    const r = transformRefund({
      ...REFUND_ROW,
      request_amount: 500,
      approved_transaction_amount: 300,
    })
    expect(r.amount).toBe(50000)
  })

  it('maps DECLINED to failed with the processor message', () => {
    const r = RefundSchema.parse(transformRefund({ ...REFUND_ROW, transaction_status: 'DECLINED' }))
    expect(r.status).toBe('failed')
    expect(r.failureReason).toBe('Transacción aprobada')
  })

  it('throws rather than inventing an id, charge id or currency', () => {
    expect(() => transformRefund({ ...REFUND_ROW, ticket_number: undefined })).toThrow(
      /ticket_number/,
    )
    expect(() => transformRefund({ ...REFUND_ROW, sale_ticket_number: '' })).toThrow(
      /sale_ticket_number/,
    )
    expect(() => transformRefund({ ...REFUND_ROW, currency_code: '' })).toThrow(/currency_code/)
  })
})
