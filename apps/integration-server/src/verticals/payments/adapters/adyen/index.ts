/**
 * Adyen adapter — payments vertical.
 *
 * API-key auth via `X-API-Key`. Coverage: payments (captures + cancels),
 * refunds, recurring contracts (subscriptions), payouts, disputes,
 * balance transactions. No native invoice or plan surface.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice — Adyen has no invoice API; it is a payment-processing
 *   platform and none of its APIs (Checkout v71, Recurring v68, Transfers v4)
 *   expose invoice endpoints.
 * Unavailable: plan — Adyen has no subscription plan / pricing-plan API;
 *   recurring contracts are tokenised stored-payment-method records, not named
 *   billing plans (confirmed via Recurring v68 API Explorer).
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { CHECKOUT_API_VERSION } from './constants'
import { buildCredentials, merchantAccountFrom } from './auth'
import { AdyenClient } from './client'
import { parseAdyenWebhookEvents, verifyAdyenWebhook } from './webhook'

import {
  transformCharge,
  type RawAdyenPaymentResponse,
} from './transform/charge'
import { transformRefund, type RawAdyenRefundResponse } from './transform/refund'

export class AdyenAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'adyen'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Adyen uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Adyen uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'Generate in Adyen Customer Area → Developers → API credentials.',
      },
      {
        name: 'merchantAccount',
        label: 'Merchant account',
        type: 'text',
        required: true,
        placeholder: 'YourCompanyECOM',
      },
      {
        name: 'baseUrl',
        label: 'API base URL',
        type: 'url',
        required: false,
        helpText: 'Test = https://checkout-test.adyen.com. Live = your live prefix.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /** Adyen merchant account code (from credentials.extra), matched against the
   *  merchantAccountCode on inbound webhook events for connection routing. */
  externalAccountId(credentials: Credentials): string | undefined {
    return merchantAccountFrom(credentials) || undefined
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAdyenWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAdyenWebhookEvents(payload)
  }

  private client(credentials: Credentials): AdyenClient {
    return new AdyenClient(credentials)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const raw = await this.client(credentials).post<RawAdyenPaymentResponse>(
      `/${CHECKOUT_API_VERSION}/payments`,
      {
        amount: { value: data.amount ?? 0, currency: (data.currency ?? 'EUR').toUpperCase() },
        reference: data.description ?? `charge-${Date.now()}`,
        merchantAccount: merchantAccountFrom(credentials),
      },
    )
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    // Adyen has no public list endpoint on the Checkout API. Production
    // integrations consume webhook notifications + reports; v1 returns
    // empty and relies on webhook-driven canonical materialisation.
    return []
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for Adyen refund')
    const raw = await this.client(credentials).post<RawAdyenRefundResponse>(
      `/${CHECKOUT_API_VERSION}/payments/${data.chargeId}/refunds`,
      {
        amount: { value: data.amount ?? 0, currency: (data.currency ?? 'EUR').toUpperCase() },
        merchantAccount: merchantAccountFrom(credentials),
      },
    )
    return transformRefund(raw)
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawAdyenPaymentResponse>(
      `/${CHECKOUT_API_VERSION}/payments/${id}/cancels`,
      { merchantAccount: merchantAccountFrom(credentials) },
    )
    return transformCharge(raw)
  }
}
