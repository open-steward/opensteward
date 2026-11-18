import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/solidgate/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'
import { chargeback } from '../fixtures/documented'

describe('solidgate transformDispute (chargebacks report)', () => {
  it('maps the documented example chargeback', () => {
    const d = DisputeSchema.parse(transformDispute(chargeback(), 'order-9'))
    expect(d.id).toBe('892140')
    expect(d.externalId).toBe('892140')
    expect(d.chargeId).toBe('order-9')
    expect(d.amount).toBe(100)
    expect(d.currency).toBe('USD')
    expect(d.status).toBe('won')
    expect(d.evidenceDueBy).toBe('2025-08-28T00:00:00Z')
    expect(d.metadata).toEqual({
      type: '1st_chb',
      reason_group: 'Fraud',
      reason_code: '10.4',
      reason_description: 'Fraud – Card-Absent Environment',
    })
    expect(d.createdAt).toBe('2025-08-18T09:57:49Z')
    expect(d.gateway).toBe('solidgate')
  })

  it('takes the deadline of the newest flow', () => {
    const cb = chargeback()
    cb.flows.push({
      ...cb.flows[0]!,
      id: '2',
      created_at: '2025-09-01 00:00:00',
      deadline_date: '2025-09-20 00:00:00',
    })
    expect(DisputeSchema.parse(transformDispute(cb, 'o')).evidenceDueBy).toBe(
      '2025-09-20T00:00:00Z',
    )
  })

  it.each([
    ['in_progress', 'needs_response'],
    ['document_sent', 'under_review'],
    ['reversed', 'won'],
    ['accepted', 'lost'],
    ['resolved', 'charge_refunded'],
    ['resolved_reversal', 'charge_refunded'],
    ['new_one', 'unknown'],
  ])('maps chargeback status %s to %s', (status, expected) => {
    expect(DisputeSchema.parse(transformDispute({ ...chargeback(), status }, 'o')).status).toBe(
      expected,
    )
  })
})
