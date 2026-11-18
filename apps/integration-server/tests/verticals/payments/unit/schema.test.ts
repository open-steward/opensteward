import { describe, it, expect } from 'vitest'
import {
  CustomerSchema,
  PaymentMethodSchema,
  ChargeSchema,
  RefundSchema,
  SubscriptionSchema,
  InvoiceSchema,
  InvoiceLineItemSchema,
  PayoutSchema,
  DisputeSchema,
  PlanSchema,
  PriceSchema,
  ProductSchema,
  BalanceTransactionSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/payments/schema'

describe('payments canonical schemas', () => {
  it('parses a minimal Customer', () => {
    const parsed = CustomerSchema.parse({
      id: 'cus_1',
      externalId: 'cus_1',
      gateway: 'stripe',
      metadata: {},
    })
    expect(parsed.gateway).toBe('stripe')
  })

  it('parses a PaymentMethod', () => {
    const parsed = PaymentMethodSchema.parse({
      id: 'pm_1',
      externalId: 'pm_1',
      type: 'card',
      brand: 'visa',
      last4: '4242',
      gateway: 'stripe',
      metadata: {},
    })
    expect(parsed.type).toBe('card')
  })

  it('parses a Charge in integer minor units', () => {
    const parsed = ChargeSchema.parse({
      id: 'ch_1',
      externalId: 'ch_1',
      amount: 1999,
      currency: 'USD',
      status: 'succeeded',
      gateway: 'stripe',
      metadata: {},
    })
    expect(parsed.amount).toBe(1999)
    expect(parsed.currency).toBe('USD')
  })

  it('rejects a Charge with float amount', () => {
    const result = ChargeSchema.safeParse({
      id: 'ch_1',
      externalId: 'ch_1',
      amount: 19.99,
      currency: 'USD',
      status: 'succeeded',
      gateway: 'stripe',
      metadata: {},
    })
    expect(result.success).toBe(false)
  })

  it('parses a Refund linked to a charge', () => {
    const parsed = RefundSchema.parse({
      id: 're_1',
      externalId: 're_1',
      chargeId: 'ch_1',
      amount: 500,
      currency: 'USD',
      status: 'succeeded',
      gateway: 'stripe',
      metadata: {},
    })
    expect(parsed.chargeId).toBe('ch_1')
  })

  it('parses a Subscription with multi-item billing', () => {
    const parsed = SubscriptionSchema.parse({
      id: 'sub_1',
      externalId: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      items: [
        { id: 'si_1', priceId: 'price_a', quantity: 1, amount: 1000 },
        { id: 'si_2', priceId: 'price_b', quantity: 2, amount: 500 },
      ],
      gateway: 'stripe',
      metadata: {},
    })
    expect(parsed.items).toHaveLength(2)
    expect(parsed.status).toBe('active')
  })

  it('parses an Invoice + line items', () => {
    const invoice = InvoiceSchema.parse({
      id: 'in_1',
      externalId: 'in_1',
      customerId: 'cus_1',
      status: 'open',
      currency: 'USD',
      total: 1500,
      gateway: 'stripe',
      metadata: {},
    })
    expect(invoice.total).toBe(1500)

    const line = InvoiceLineItemSchema.parse({
      id: 'il_1',
      externalId: 'il_1',
      invoiceId: 'in_1',
      amount: 1500,
      currency: 'USD',
      metadata: {},
    })
    expect(line.invoiceId).toBe('in_1')
  })

  it('parses Payout, Dispute, Plan, Price, Product, BalanceTransaction', () => {
    expect(
      PayoutSchema.parse({
        id: 'po_1',
        externalId: 'po_1',
        amount: 10000,
        currency: 'USD',
        status: 'paid',
        gateway: 'stripe',
        metadata: {},
      }).status,
    ).toBe('paid')

    expect(
      DisputeSchema.parse({
        id: 'dp_1',
        externalId: 'dp_1',
        chargeId: 'ch_1',
        amount: 1999,
        currency: 'USD',
        status: 'needs_response',
        gateway: 'stripe',
        metadata: {},
      }).chargeId,
    ).toBe('ch_1')

    expect(
      PlanSchema.parse({
        id: 'plan_1',
        externalId: 'plan_1',
        amount: 1000,
        currency: 'USD',
        interval: 'month',
        gateway: 'stripe',
        metadata: {},
      }).interval,
    ).toBe('month')

    expect(
      PriceSchema.parse({
        id: 'price_1',
        externalId: 'price_1',
        productId: 'prod_1',
        unitAmount: 500,
        currency: 'USD',
        type: 'recurring',
        gateway: 'stripe',
        metadata: {},
      }).unitAmount,
    ).toBe(500)

    expect(
      ProductSchema.parse({
        id: 'prod_1',
        externalId: 'prod_1',
        name: 'Pro plan',
        gateway: 'stripe',
        metadata: {},
      }).name,
    ).toBe('Pro plan')

    expect(
      BalanceTransactionSchema.parse({
        id: 'btxn_1',
        externalId: 'btxn_1',
        type: 'charge',
        amount: 1999,
        currency: 'USD',
        gateway: 'stripe',
        metadata: {},
      }).type,
    ).toBe('charge')
  })

  it('parses a WebhookEvent', () => {
    const parsed = WebhookEventSchema.parse({
      platform: 'stripe',
      type: 'charge.succeeded',
      resourceType: 'charges',
      action: 'succeeded',
      resourceId: 'ch_1',
      payload: { id: 'ch_1' },
    })
    expect(parsed.type).toBe('charge.succeeded')
  })
})
