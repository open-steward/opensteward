import { describe, it, expect } from 'vitest'
import { transformDispute } from '../../../../../../../src/verticals/payments/adapters/payabli/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'
import { CHARGEBACKS_LIST, CHARGEBACK_RECORD } from '../fixtures/documented'

describe('payabli transformDispute', () => {
  it('maps the documented chargeback list record', () => {
    const d = DisputeSchema.parse(transformDispute(CHARGEBACKS_LIST.Records[0]))
    expect(d.id).toBe('578')
    expect(d.chargeId).toBe('10-bfcd5a17861d4a8690ca53c00000X')
    expect(d.amount).toBe(150)
    // from Transaction.PaymentData.paymentDetails.currency
    expect(d.currency).toBe('USD')
    expect(d.status).toBe('lost')
    expect(d.evidenceDueBy).toBe('2023-03-02T15:36:49.000Z')
    expect(d.createdAt).toBe('2023-02-20T15:36:49.000Z')
    expect(d.metadata).toEqual({ reason: 'Testing', reasonCode: '00001', caseNumber: '00001' })
  })

  it('maps the documented GET /ChargeBacks/read/{Id} body', () => {
    const d = DisputeSchema.parse(transformDispute(CHARGEBACK_RECORD))
    expect(d.id).toBe(String(CHARGEBACK_RECORD.Id))
    expect(d.currency).toBe('USD')
  })

  it('throws rather than defaulting a currency', () => {
    const { Transaction: _t, ...rest } = CHARGEBACKS_LIST.Records[0]
    expect(() => transformDispute(rest)).toThrow(/currency/)
    expect(DisputeSchema.parse(transformDispute(rest, 'CAD')).currency).toBe('CAD')
  })

  it.each([
    [0, 'needs_response'],
    [1, 'under_review'],
    [2, 'won'],
    [3, 'lost'],
    [4, 'unknown'],
    [5, 'unknown'],
  ] as const)('maps Status %s to %s', (Status, status) => {
    expect(
      DisputeSchema.parse(transformDispute({ ...CHARGEBACKS_LIST.Records[0], Status })).status,
    ).toBe(status)
  })
})
