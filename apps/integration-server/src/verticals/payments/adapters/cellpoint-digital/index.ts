/**
 * CellPoint Digital adapter — payments vertical.
 *
 * CellPoint Digital's Velocity Payment Orchestration Platform (POP) fronts many
 * PSPs behind a single integration via the mPoint API. It is transaction-
 * oriented: a payment flows initialize → authorize → capture, and is addressed
 * afterwards by its Velocity transaction id (and the merchant `order-no`).
 * There are no collection/list endpoints, so the list* resource methods are
 * intentionally left unimplemented — the router auto-returns 501 for those.
 *
 * Implemented resources:
 *   - getCharge      → GET  /mpoint/get-transaction-status
 *   - captureCharge  → POST /mpoint/capture-payment
 *   - cancelCharge   → POST /mpoint/refund (full reversal of an authorisation)
 *   - createRefund   → POST /mpoint/refund
 *
 * Auth: HTTP Basic (`Authorization: Basic …`) plus a per-request integrity
 * token (`x-cpm-sec-token` = SHA-256(body + salt)); see `auth.ts` + `client.ts`.
 * Webhooks are JSON callbacks verified with an in-body SHA-512 signature
 * (`webhook.ts`).
 *
 * Docs: https://documentation.cellpointdigital.com/docs/api
 *       https://documentation.cellpointdigital.com/docs/payment-operations
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:    charge, refund
// Unavailable:  balance-transaction — no ledger/balance concept; only per-transaction status via get-transaction-status
// Unavailable:  customer — no customer management endpoints; platform is transaction-oriented, no stored profiles
// Unavailable:  dispute — no dispute/chargeback API; disputes handled externally by acquiring banks and PSPs
// Unavailable:  invoice — no invoicing concept; pure payment-orchestration layer
// Unavailable:  payment-method — no stored payment-method management API; tokens managed by downstream PSP
// Unavailable:  payout — no payout/settlement endpoints; settlement handled by acquiring bank
// Unavailable:  plan — no subscription billing, plan/price/product catalogue, or recurring billing
// Unavailable:  subscription — no subscription management; single-transaction orchestration only

import type { BaseAdapter, CredentialField, Credentials } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { PATHS } from './constants'
import { FORM, clientId, account } from './auth'
import { CellpointDigitalClient } from './client'
import {
  verifyCellpointDigitalWebhook,
  parseCellpointDigitalWebhookEvents,
} from './webhook'

import { transformCharge } from './transform/charge'
import { transformRefund } from './transform/refund'

function escapeXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export class CellpointDigitalAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'cellpoint-digital'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'CellPoint Digital uses HTTP Basic credentials + an HMAC salt; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('CellPoint Digital uses static credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static credentials — nothing to refresh.
    return credentials
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCellpointDigitalWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCellpointDigitalWebhookEvents(payload)
  }

  // ── Client ──────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): CellpointDigitalClient {
    return new CellpointDigitalClient(credentials)
  }

  // ── Charges ───────────────────────────────────────────────────────────────
  //
  // Velocity has no charge list; a charge is a transaction addressed by its
  // Velocity transaction id.

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const body =
      `<get-transaction-status>` +
      `<client-id>${escapeXml(clientId(credentials))}</client-id>` +
      `<transactions><transaction-id>${escapeXml(id)}</transaction-id></transactions>` +
      `</get-transaction-status>`
    // get-transaction-status accepts the query body; the client signs + GETs.
    const xml = await this.client(credentials).post(PATHS.getTransactionStatus, body)
    return transformCharge(xml)
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const amountXml =
      data?.amount !== undefined ? `<amount>${escapeXml(String(data.amount))}</amount>` : ''
    const body =
      `<capture-payment>` +
      `<client-id>${escapeXml(clientId(credentials))}</client-id>` +
      `<account>${escapeXml(account(credentials))}</account>` +
      `<transaction-id>${escapeXml(id)}</transaction-id>` +
      amountXml +
      `</capture-payment>`
    await this.client(credentials).post(PATHS.capturePayment, body)
    // The capture response is a thin status code; re-read the transaction for a
    // complete canonical Charge.
    return this.getCharge(credentials, id)
  }

  /**
   * Cancel an uncaptured authorisation. Velocity models this as a full
   * reversal/refund of the original transaction.
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const body =
      `<refund>` +
      `<client-id>${escapeXml(clientId(credentials))}</client-id>` +
      `<id>${escapeXml(id)}</id>` +
      `</refund>`
    await this.client(credentials).post(PATHS.refund, body)
    return this.getCharge(credentials, id)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  //
  // Velocity has no refund list/get; a refund is a reversal action against the
  // original transaction id. The response is a thin status code, so we thread
  // the request context into the canonical Refund.

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (original transaction id) is required for a CellPoint Digital refund.')
    }
    const amountXml =
      data.amount !== undefined ? `<amount>${escapeXml(String(data.amount))}</amount>` : ''
    const orderXml = data.metadata?.['order-no']
      ? `<order-no>${escapeXml(String(data.metadata['order-no']))}</order-no>`
      : ''
    const body =
      `<refund>` +
      `<client-id>${escapeXml(clientId(credentials))}</client-id>` +
      orderXml +
      `<id>${escapeXml(data.chargeId)}</id>` +
      amountXml +
      `</refund>`
    const xml = await this.client(credentials).post(PATHS.refund, body)
    return transformRefund(xml, {
      chargeId: data.chargeId,
      amount: data.amount,
      currency: data.currency,
      orderNo: data.metadata?.['order-no'],
    })
  }
}
