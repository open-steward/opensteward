/**
 * Fixture: the documented GET /invoice/schedule response example,
 * https://docs.staxpayments.com/reference/retrieve-all-scheduled-invoices
 */
import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/stax-payments/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

const DOC_ROW = {
  id: '320c909f-7808-465f-b519-5d906bf615f8',
  merchant_id: 'f2010d6f-dc3c-40bb-bf13-8646c018ba38',
  active: true,
  count: 0,
  rule: 'FREQ=MONTHLY;INTERVAL=1;DTSTART=20250703T140000Z',
  last_run_at: null,
  next_run_at: '2025-07-03 14:00:00',
  payment_method_id: null,
  customer_id: 'cafe3d35-1128-44bc-bd49-b6587662544f',
  created_at: '2025-07-02 18:38:00',
  updated_at: '2025-07-02 18:38:00',
  status: 'NOT STARTED',
  meta: {
    lineItems: [
      {
        id: 'generated-id-d36c-54b0-6515-bca5-fc53',
        item: 'Test Item',
        details: '',
        quantity: 1,
        price: '100.00',
      },
    ],
  },
  total: 100,
}

describe('stax-payments transformSubscription', () => {
  it('maps the documented scheduled invoice', () => {
    const s = SubscriptionSchema.parse(transformSubscription(DOC_ROW))
    expect(s.id).toBe('320c909f-7808-465f-b519-5d906bf615f8')
    expect(s.customerId).toBe('cafe3d35-1128-44bc-bd49-b6587662544f')
    expect(s.status).toBe('active')
    expect(s.currency).toBeUndefined()
    expect(s.items).toEqual([{ id: 'generated-id-d36c-54b0-6515-bca5-fc53', quantity: 1 }])
    expect(s.defaultPaymentMethodId).toBeUndefined()
    expect(s.currentPeriodStart).toBeUndefined()
    expect(s.createdAt).toBe('2025-07-02T18:38:00.000Z')
  })

  it('does not guess why an inactive schedule stopped', () => {
    expect(transformSubscription({ ...DOC_ROW, active: false }).status).toBe('unknown')
  })

  it('throws on a schedule without a customer_id', () => {
    expect(() => transformSubscription({ ...DOC_ROW, customer_id: null })).toThrow(/customer_id/)
  })
})
