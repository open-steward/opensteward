import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/peach-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { DOC_REFUND } from '../fixtures'

describe('peach-payments transformRefund', () => {
  it('maps an RF record, the charge from referencedId', () => {
    const result = RefundSchema.parse(transformRefund(DOC_REFUND))
    expect(result.id).toBe('8ac7a4a18562871c01856ad602c91aab')
    expect(result.externalId).toBe('8ac7a4a18562871c01856ad602c91aab')
    expect(result.chargeId).toBe('8ac7a4a29d21e3c1019d2621802c7bc6')
    expect(result.amount).toBe(9200)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.failureReason).toBeUndefined()
    expect(result.createdAt).toBe('2022-11-10T12:59:49.520Z')
    expect(result.metadata).toEqual({ CTPE_DESCRIPTOR_TEMPLATE: '', FEEDZAI_DATA_FEED: 'true' })
    expect(result.gateway).toBe('peach-payments')
  })

  it.each([
    ['000.000.100', 'succeeded'],
    ['000.200.000', 'pending'],
    ['800.400.502', 'pending'],
    ['800.100.150', 'failed'],
    ['000.100.200', 'unknown'],
  ])('maps result.code %s to %s', (code, status) => {
    const result = RefundSchema.parse(
      transformRefund({ ...DOC_REFUND, result: { code, description: 'd' } }),
    )
    expect(result.status).toBe(status)
  })

  it('carries a rejection description as failureReason', () => {
    const result = RefundSchema.parse(
      transformRefund({
        ...DOC_REFUND,
        result: {
          code: '800.100.150',
          description: 'transaction declined (refund on gambling tx not allowed)',
        },
      }),
    )
    expect(result.failureReason).toBe('transaction declined (refund on gambling tx not allowed)')
  })

  it('throws when the record names no charge', () => {
    const { referencedId: _r, ...orphan } = DOC_REFUND
    expect(() => transformRefund(orphan)).toThrow(/referencedId/)
  })
})
