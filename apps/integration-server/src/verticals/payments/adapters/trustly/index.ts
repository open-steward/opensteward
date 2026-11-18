/**
 * Trustly adapter — payments vertical (Pay by Bank / open banking).
 *
 * Trustly is an account-to-account ("Pay by Bank") provider across Europe and
 * North America. Its classic API is JSON-RPC 2.0 over a single `/api/1`
 * endpoint, signed per-request with the merchant's RSA private key.
 *
 * The classic API has no customer / payment-method / subscription / invoice /
 * plan objects, so this adapter implements only what Trustly actually exposes:
 *
 *   - Charges            — `Deposit` (open a checkout) + `AccountLedger` rows.
 *   - Refunds            — `Refund` (against an order) + `AccountLedger` rows.
 *   - BalanceTransaction — all `AccountLedger` rows (every ledger event).
 *
 * Every other PaymentsAdapter method is intentionally left unimplemented; the
 * router answers `501 Not Implemented` for those.
 *
 * Auth: api_key model — processing-account username/password + RSA private key
 * submitted via the Connect Link form (no OAuth).
 *
 * Docs: https://docs.trustly.com/api
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: customer      — Trustly has no customer object; bank accounts
 *                              are identified per-transaction via EndUserID only.
 * Unavailable: payment-method — No stored payment-method API; bank details are
 *                              captured ephemerally inside the Trustly checkout.
 * Unavailable: subscription  — Trustly is a push-payment gateway with no
 *                              subscription/recurring billing API.
 * Unavailable: invoice       — No invoice object or API in the classic API.
 * Unavailable: plan          — No plan/price/product catalog in the classic API.
 * Unavailable: dispute       — No dispute management API; chargebacks appear as
 *                              ledger rows only (no structured dispute resource).
 * Unverified:  payout        — `GetWithdrawals` method is documented to exist
 *                              and returns payout status, but exact response
 *                              field names could not be verified (docs behind
 *                              403 auth wall).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_LEDGER_LOOKBACK_DAYS } from './constants'
import { buildCredentials, trustlyCredentialFields } from './auth'
import { TrustlyClient } from './client'
import { verifyTrustlyWebhook, parseTrustlyWebhookEvents } from './webhook'

import {
  transformBalanceTransaction,
  type RawTrustlyLedgerRow,
} from './transform/balance-transaction'
import { transformCharge, type RawTrustlyCharge } from './transform/charge'
import { transformRefund, type RawTrustlyRefund } from './transform/refund'

/** Trustly expects ledger dates as `YYYY-MM-DD HH:MM:SS` (UTC). */
function trustlyDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export class TrustlyAdapter implements PaymentsAdapter {
  readonly platform = 'trustly'
  readonly version = '0.1.0'

  // ── Auth (api_key via Connect Link) ─────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('Trustly uses signed API credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Trustly uses signed API credentials; call exchangeCredentials instead.')
  }

  credentialFields() {
    return trustlyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Signed-key auth never expires; nothing to refresh.
    return credentials
  }

  // ── Notifications ───────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTrustlyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTrustlyWebhookEvents(payload)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): TrustlyClient {
    return new TrustlyClient(credentials)
  }

  /** Build the AccountLedger date range from the caller's params. */
  private ledgerRange(params: QueryParams): { FromDate: string; ToDate: string } {
    const to = new Date()
    const from =
      params.updatedAfter instanceof Date
        ? params.updatedAfter
        : new Date(to.getTime() - DEFAULT_LEDGER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    return { FromDate: trustlyDate(from), ToDate: trustlyDate(to) }
  }

  // ── Balance Transactions ─────────────────────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.client(credentials).call<RawTrustlyLedgerRow[]>(
      'AccountLedger',
      this.ledgerRange(params),
    )
    return (Array.isArray(rows) ? rows : []).map(transformBalanceTransaction)
  }

  // ── Charges ─────────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.client(credentials).call<RawTrustlyCharge[]>(
      'AccountLedger',
      this.ledgerRange(params),
    )
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => {
        const t = String(r.transactiontype ?? '').toLowerCase()
        return t === 'deposit' || t === 'credit'
      })
      .map(transformCharge)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    // `Deposit` opens a hosted checkout and returns `{ orderid, url }`.
    const result = await this.client(credentials).call<RawTrustlyCharge>('Deposit', {
      EndUserID: data.customerId ?? '',
      MessageID: data.id ?? data.externalId ?? '',
      Amount: data.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
      Currency: data.currency,
    })
    return transformCharge({
      ...result,
      enduserid: data.customerId ?? undefined,
      messageid: data.id ?? data.externalId,
      amount: data.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
      currency: data.currency,
    })
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.client(credentials).call<RawTrustlyRefund[]>(
      'AccountLedger',
      this.ledgerRange(params),
    )
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => String(r.transactiontype ?? '').toLowerCase() === 'refund')
      .map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Trustly OrderID) is required for a refund.')
    const result = await this.client(credentials).call<RawTrustlyRefund>('Refund', {
      OrderID: data.chargeId,
      Amount: data.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
      Currency: data.currency,
    })
    return transformRefund({
      ...result,
      refundorderid: data.chargeId,
      amount: data.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
      currency: data.currency,
    })
  }
}
