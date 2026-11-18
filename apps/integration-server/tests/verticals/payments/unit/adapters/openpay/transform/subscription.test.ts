/**
 * Fixture: the "Objeto Suscripción" example object
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawOpenpaySubscription,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

const CUS = 'a2b79p8xmzeyvmolqfja'

const DOC: RawOpenpaySubscription = {
  status: 'trial',
  card: {
    type: 'debit',
    brand: 'mastercard',
    card_number: '1111',
    holder_name: 'Juan Perez Ramirez',
    expiration_year: '20',
    expiration_month: '12',
    allows_charges: true,
    allows_payouts: false,
    creation_date: '2013-12-13T12:39:46-06:00',
    bank_name: 'DESCONOCIDO',
    customer_id: null,
    bank_code: '000',
  },
  id: 'svxdm1suclzipbi4pavm',
  cancel_at_period_end: false,
  charge_date: '2014-01-12',
  creation_date: '2013-12-13T12:39:46-06:00',
  current_period_number: 0,
  period_end_date: '2014-01-11',
  trial_end_date: '2014-01-11',
  plan_id: 'pjl7wfryrrd1tznr0fnl',
  customer_id: CUS,
}

describe('openpay transformSubscription', () => {
  it('maps the documented subscription object', () => {
    const r = SubscriptionSchema.parse(transformSubscription(DOC, CUS))
    expect(r.id).toBe(`${CUS}:svxdm1suclzipbi4pavm`)
    expect(r.externalId).toBe('svxdm1suclzipbi4pavm')
    expect(r.customerId).toBe(CUS)
    expect(r.status).toBe('trialing')
    expect(r.items).toEqual([
      { id: 'svxdm1suclzipbi4pavm:pjl7wfryrrd1tznr0fnl', priceId: 'pjl7wfryrrd1tznr0fnl' },
    ])
    expect(r.cancelAtPeriodEnd).toBe(false)
    expect(r.createdAt).toBe('2013-12-13T18:39:46.000Z')
    expect(r.metadata).toEqual({
      status: 'trial',
      charge_date: '2014-01-12',
      period_end_date: '2014-01-11',
      trial_end_date: '2014-01-11',
      current_period_number: '0',
    })
  })

  it('invents nothing the object does not document', () => {
    const r = transformSubscription(DOC, CUS)
    expect(r.currency).toBeUndefined()
    expect(r.cancelledAt).toBeUndefined()
    expect(r.currentPeriodEnd).toBeUndefined()
    // The example card carries no id, so there is no payment method to link.
    expect(r.defaultPaymentMethodId).toBeUndefined()
  })

  it('links the card by its readable "customerId:cardId" id', () => {
    const r = transformSubscription({ ...DOC, card: { id: 'kgipbqixvjg3gbzowl7l' } }, CUS)
    expect(r.defaultPaymentMethodId).toBe(`${CUS}:kgipbqixvjg3gbzowl7l`)
  })

  it.each([
    ['active', 'active'],
    ['trial', 'trialing'],
    ['past_due', 'past_due'],
    ['unpaid', 'expired'],
    ['cancelled', 'cancelled'],
    ['paused', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(SubscriptionSchema.parse(transformSubscription({ ...DOC, status }, CUS)).status).toBe(
      expected,
    )
  })

  it('reads cancel_at_period_end as a boolean or the documented string type', () => {
    expect(
      transformSubscription({ ...DOC, cancel_at_period_end: true }, CUS).cancelAtPeriodEnd,
    ).toBe(true)
    expect(
      transformSubscription({ ...DOC, cancel_at_period_end: 'true' }, CUS).cancelAtPeriodEnd,
    ).toBe(true)
    const { cancel_at_period_end: _c, ...rest } = DOC
    expect(transformSubscription(rest, CUS).cancelAtPeriodEnd).toBeUndefined()
  })

  it('has no items when plan_id is absent', () => {
    const { plan_id: _p, ...rest } = DOC
    expect(SubscriptionSchema.parse(transformSubscription(rest, CUS)).items).toEqual([])
  })

  it('throws on a record without an id', () => {
    const { id: _i, ...rest } = DOC
    expect(() => transformSubscription(rest, CUS)).toThrow(/no id/)
  })
})
