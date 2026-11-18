/**
 * Amazon Payment Services (APS, formerly PayFort) adapter — payments vertical.
 *
 * APS anchors the MENA region (UAE, KSA, Egypt, …). It is a server-to-server,
 * command-based gateway: every operation is a signed JSON POST to a single
 * `/FortAPI/paymentApi` endpoint, selected by the `command` /
 * `service_command` / `query_command` field. There is no list/collection
 * endpoint, no standalone Customers API, and no subscription/invoice/plan
 * objects, so this adapter implements exactly what APS exposes:
 *
 *   - createCharge   → PURCHASE (auth+capture) or AUTHORIZATION (auth only)
 *   - getCharge      → CHECK_STATUS query (id = fort_id or merchant_reference)
 *   - captureCharge  → CAPTURE a prior AUTHORIZATION
 *   - cancelCharge   → VOID_AUTHORIZATION of an uncaptured authorization
 *   - createRefund   → REFUND a prior PURCHASE/CAPTURE
 *
 * Everything else (list*, customers, payment methods, subscriptions, invoices,
 * payouts, disputes, plans, prices, products, balance transactions) is left
 * off and auto-returns 501.
 *
 * Auth: per-request `access_code` + `merchant_identifier` + SHA `signature`
 * (request phrase). Responses + feedback notifications are verified with the
 * SHA response phrase. No OAuth, no token refresh.
 *
 * Money: APS quotes amounts in the currency's minor units already (integer),
 * matching the canonical schema directly.
 *
 * Docs: https://paymentservices.amazon.com/docs/api
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   charge, refund
// Unavailable: balance-transaction — APS has no ledger/balance-transaction API; the Reporting API returns raw transaction rows only
// Unavailable: customer       — APS has no customer management resource; customer details are embedded per-transaction only
// Unavailable: dispute        — APS has no dispute/chargeback API; chargebacks are handled out-of-band via the merchant dashboard
// Unavailable: invoice        — APS has no invoice resource; Payment Link is a UI construct with no programmatic invoice object
// Unavailable: payment-method — APS has no payment-method list/get API; card tokens are referenced by token_name only
// Unavailable: payout         — APS has no payout/settlement API; disbursements are managed by the acquiring bank outside APS
// Unavailable: plan           — APS has no plan/price/product resource; recurring billing is merchant-scheduled PURCHASE+eci=RECURRING
// Unavailable: subscription   — APS has no subscription management resource; recurring payments are merchant-scheduled PURCHASE commands

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { AmazonPaymentServicesClient } from './client'
import { COMMANDS, QUERY_COMMANDS } from './constants'
import {
  parseAmazonPaymentServicesWebhookEvents,
  verifyAmazonPaymentServicesWebhook,
} from './webhook'

import { transformCharge, type RawApsCharge } from './transform/charge'
import { transformRefund, type RawApsRefund } from './transform/refund'

export class AmazonPaymentServicesAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'amazon-payment-services'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'Amazon Payment Services uses access code + merchant identifier + SHA phrases; ' +
        'submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Amazon Payment Services does not use OAuth; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'merchantIdentifier',
        label: 'Merchant identifier',
        type: 'text',
        required: true,
        helpText: 'Found under Integration Settings → Security in the APS dashboard.',
      },
      {
        name: 'accessCode',
        label: 'Access code',
        type: 'password',
        required: true,
        helpText: 'The channel access code from Integration Settings → Security.',
      },
      {
        name: 'requestPhrase',
        label: 'SHA request phrase',
        type: 'password',
        required: true,
        helpText: 'Used to sign outbound requests.',
      },
      {
        name: 'responsePhrase',
        label: 'SHA response phrase',
        type: 'password',
        required: true,
        helpText: 'Used to verify responses and feedback notifications.',
      },
      {
        name: 'shaType',
        label: 'SHA type',
        type: 'select',
        required: false,
        options: [
          { value: 'sha256', label: 'SHA-256' },
          { value: 'sha512', label: 'SHA-512' },
        ],
        helpText: 'Must match the SHA type configured on the merchant account.',
      },
      {
        name: 'language',
        label: 'Language',
        type: 'select',
        required: false,
        options: [
          { value: 'en', label: 'English' },
          { value: 'ar', label: 'Arabic' },
        ],
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks (feedback notifications) ───────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAmazonPaymentServicesWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAmazonPaymentServicesWebhookEvents(payload)
  }

  private client(credentials: Credentials): AmazonPaymentServicesClient {
    return new AmazonPaymentServicesClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────────

  /**
   * Look up a transaction via the CHECK_STATUS query. `id` is the APS
   * `fort_id`; callers without a fort_id may pass the original
   * `merchant_reference` via `params.merchantReference` on list-style flows.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).command<RawApsCharge>({
      query_command: QUERY_COMMANDS.CHECK_STATUS,
      fort_id: id,
    })
    return transformCharge(raw ?? {})
  }

  /**
   * Create a charge. By default this runs a PURCHASE (authorize + capture in
   * one step). Pass `metadata.command = 'AUTHORIZATION'` to authorize only.
   * Requires a tokenized card (`metadata.tokenName`) — APS server-to-server
   * payments operate on a previously-collected card token.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const command =
      data.metadata?.command === 'AUTHORIZATION'
        ? COMMANDS.AUTHORIZATION
        : COMMANDS.PURCHASE
    const tokenName = data.metadata?.tokenName
    if (!tokenName) {
      throw new Error('Amazon Payment Services charge requires metadata.tokenName (a card token).')
    }
    const body: Record<string, unknown> = {
      command,
      merchant_reference: data.id ?? `ref_${Date.now()}`,
      amount: data.amount,
      currency: (data.currency ?? 'AED').toUpperCase(),
      token_name: tokenName,
      customer_email: data.receiptEmail ?? data.metadata?.customerEmail,
      customer_ip: data.metadata?.customerIp,
    }
    const raw = await this.client(credentials).command<RawApsCharge>(body)
    return transformCharge(raw ?? {})
  }

  /** Capture a previously-authorized charge. `id` is the authorization fort_id. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const raw = await this.client(credentials).command<RawApsCharge>({
      command: COMMANDS.CAPTURE,
      fort_id: id,
      amount: data?.amount,
    })
    return transformCharge(raw ?? {})
  }

  /** Void an uncaptured authorization. `id` is the authorization fort_id. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).command<RawApsCharge>({
      command: COMMANDS.VOID_AUTHORIZATION,
      fort_id: id,
    })
    return transformCharge(raw ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  /** Refund a captured/purchased charge. `data.chargeId` is the original fort_id. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (the original APS fort_id) is required for a refund.')
    }
    const raw = await this.client(credentials).command<RawApsRefund>({
      command: COMMANDS.REFUND,
      fort_id: data.chargeId,
      amount: data.amount,
      currency: data.currency ? data.currency.toUpperCase() : undefined,
    })
    return transformRefund({ ...(raw ?? {}), original_fort_id: data.chargeId })
  }
}
