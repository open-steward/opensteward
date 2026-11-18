import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/solidgate/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { cardOrder } from '../fixtures/documented'

describe('solidgate transformRefund (refund transaction of a card order)', () => {
  it('maps a documented transaction with operation refund', () => {
    const tx = { ...cardOrder().transactions[0]!, operation: 'refund', status: 'success' }
    const r = RefundSchema.parse(transformRefund(tx, 'order-1'))
    expect(r.id).toBe('5019d00bb70f82cd42f6bc654cbdfcbd63a9b5b1dbd6a')
    expect(r.externalId).toBe(r.id)
    expect(r.chargeId).toBe('order-1')
    expect(r.amount).toBe(100)
    expect(r.currency).toBe('USD')
    expect(r.status).toBe('succeeded')
    expect(r.metadata).toEqual({
      refund_reason: 'Solidgate - Issuer Fraud Notification',
      refund_reason_code: '0022',
    })
    expect(r.createdAt).toBe('2026-07-15T11:45:30Z')
    expect(r.updatedAt).toBe('2026-07-16T11:45:30Z')
    expect(r.gateway).toBe('solidgate')
  })

  it.each([
    ['processing', 'pending'],
    ['verify', 'pending'],
    ['success', 'succeeded'],
    ['fail', 'failed'],
    ['other', 'unknown'],
  ])('maps transaction status %s to %s', (status, expected) => {
    const tx = { ...cardOrder().transactions[0]!, operation: 'refund', status }
    expect(RefundSchema.parse(transformRefund(tx, 'o')).status).toBe(expected)
  })
})
