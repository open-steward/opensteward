/**
 * Braintree adapter — payments vertical.
 *
 * Basic-auth derived from `public_key:private_key`. Primary surface is
 * GraphQL. Coverage: transactions (charges), refunds, customers, payment
 * methods, subscriptions + plans, disputes.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — Braintree has no BalanceTransaction type in its GraphQL API; the REST Settlement Batch Summary is a date-aggregate report, not a per-transaction ledger entry.
// Unavailable: invoice — Braintree has no invoice object; "Pay Upon Invoice" is a payment-method type embedded in transactions, not a queryable resource.
// Unavailable: payout — Braintree disbursements are webhook-only; no REST or GraphQL endpoint exists to list/fetch disbursement objects.

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Subscription } from '../../schema/subscription'
import type { Plan } from '../../schema/plan'
import type { Dispute } from '../../schema/dispute'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { BraintreeClient } from './client'
import { parseBraintreeWebhookEvents, verifyBraintreeWebhook } from './webhook'

import { transformCharge, type RawBraintreeTransaction } from './transform/charge'
import { transformRefund, type RawBraintreeRefund } from './transform/refund'
import { transformCustomer, type RawBraintreeCustomer } from './transform/customer'
import {
  transformPaymentMethod,
  type RawBraintreePaymentMethod,
} from './transform/payment-method'
import {
  transformSubscription,
  type RawBraintreeSubscription,
} from './transform/subscription'
import { transformPlan, type RawBraintreePlan } from './transform/plan'
import { transformDispute, type RawBraintreeDispute } from './transform/dispute'

export class BraintreeAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'braintree'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Braintree uses merchant credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Braintree uses merchant credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production' },
          { value: 'sandbox', label: 'Sandbox' },
        ],
      },
      { name: 'merchantId', label: 'Merchant ID', type: 'text', required: true },
      { name: 'publicKey', label: 'Public key', type: 'text', required: true },
      { name: 'privateKey', label: 'Private key', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBraintreeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBraintreeWebhookEvents(payload)
  }

  private client(credentials: Credentials): BraintreeClient {
    return new BraintreeClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const data = await this.client(credentials).query<{
      node?: RawBraintreeTransaction
    }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Transaction {
            id legacyId status createdAt
            amount { value currencyIsoCode }
            customer { id }
            paymentMethodSnapshot { __typename ... on CreditCardDetails { last4 } }
            refundedTransactions { id }
            disputes { id }
          }
        }
      }`,
      { id },
    )
    return transformCharge(data.node ?? {})
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // Braintree's `search` GraphQL is page-token based with complex filters;
    // v1 of the adapter leaves bulk list to webhook-driven sync.
    return []
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const data = await this.client(credentials).query<{ node?: RawBraintreeRefund }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Refund {
            id legacyId status createdAt
            amount { value currencyIsoCode }
            refundedTransaction { id }
          }
        }
      }`,
      { id },
    )
    return transformRefund(data.node ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const data = await this.client(credentials).query<{ node?: RawBraintreeCustomer }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Customer { id legacyId email firstName lastName phoneNumber company createdAt }
        }
      }`,
      { id },
    )
    return transformCustomer(data.node ?? {})
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    return []
  }

  // ── PaymentMethod ───────────────────────────────────────────────────────

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const data = await this.client(credentials).query<{ node?: RawBraintreePaymentMethod }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on PaymentMethod {
            id default
            details {
              __typename
              ... on CreditCardDetails { brandCode last4 expirationMonth expirationYear cardholderName bin fingerprint }
              ... on PayPalAccountDetails { email }
            }
            customer { id }
          }
        }
      }`,
      { id },
    )
    return transformPaymentMethod(data.node ?? {})
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const data = await this.client(credentials).query<{ node?: RawBraintreeSubscription }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Subscription {
            id status createdAt
            plan { id }
            paymentMethod { id }
            price { value currencyIsoCode }
            billingPeriodStartDate billingPeriodEndDate nextBillingDate trialEndDate
          }
        }
      }`,
      { id },
    )
    return transformSubscription(data.node ?? {})
  }

  async listSubscriptions(_credentials: Credentials, _params: QueryParams): Promise<Subscription[]> {
    return []
  }

  // ── Plans ────────────────────────────────────────────────────────────────

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const data = await this.client(credentials).query<{ node?: RawBraintreePlan }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Plan {
            id name description billingFrequency billingFrequencyUnit
            trialDuration trialDurationUnit numberOfBillingCycles createdAt
            price { value currencyIsoCode }
          }
        }
      }`,
      { id },
    )
    return transformPlan(data.node ?? {})
  }

  // ── Disputes ────────────────────────────────────────────────────────────

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const data = await this.client(credentials).query<{ node?: RawBraintreeDispute }>(
      `query($id: ID!) {
        node(id: $id) {
          ... on Dispute {
            id legacyId status reason receivedDate replyByDate
            amountDisputed { value currencyIsoCode }
            transaction { id }
          }
        }
      }`,
      { id },
    )
    return transformDispute(data.node ?? {})
  }
}
