import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/viva-com/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { documentedTransaction } from '../fixture'

const PARENT = 'fa248e3b-7fdb-43bb-9441-d88812f8fce5'

describe('viva-com transformRefund', () => {
  it('maps a documented refund row: negative Amount, ParentId as the charge', () => {
    const result = RefundSchema.parse(
      transformRefund(
        documentedTransaction({ TransactionTypeId: 4, Amount: -0.27, ParentId: PARENT }),
      ),
    )
    expect(result.id).toBe('e4c37c00-76ad-4730-93c2-004091ae9de1')
    expect(result.externalId).toBe('e4c37c00-76ad-4730-93c2-004091ae9de1')
    expect(result.chargeId).toBe(PARENT)
    expect(result.amount).toBe(27)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.createdAt).toBe('2024-06-21T09:37:35.577Z')
    expect(result.metadata).toEqual({ orderCode: '4173124907236419' })
    expect(result.gateway).toBe('viva-com')
  })

  it('maps the documented StatusId values', () => {
    const table: Array<[string, string]> = [
      ['F', 'succeeded'],
      ['E', 'failed'],
      ['A', 'pending'],
      ['X', 'cancelled'],
      ['MA', 'unknown'],
    ]
    for (const [statusId, status] of table) {
      const r = RefundSchema.parse(
        transformRefund(
          documentedTransaction({ ParentId: PARENT, Amount: -1, StatusId: statusId }),
        ),
      )
      expect(r.status).toBe(status)
    }
  })

  it('throws without a ParentId, instead of inventing a charge id', () => {
    expect(() => transformRefund(documentedTransaction({ Amount: -1 }))).toThrow(/ParentId/)
  })

  it('throws on an undocumented currency or a missing amount', () => {
    expect(() =>
      transformRefund(documentedTransaction({ ParentId: PARENT, CurrencyCode: 840 })),
    ).toThrow(/CurrencyCode 840/)
    expect(() =>
      transformRefund(documentedTransaction({ ParentId: PARENT, Amount: null })),
    ).toThrow(/no Amount/)
  })
})
