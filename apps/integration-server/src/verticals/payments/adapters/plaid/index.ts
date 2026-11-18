/**
 * Plaid adapter — payments vertical.
 *
 * Plaid (https://plaid.com) is a bank-data + bank-payments platform, not a card
 * acquirer. Its payments surface is the **Transfer** product: ACH / RTP money
 * movements between an originator account and an end-user's bank account. We map
 * Plaid's Transfer objects onto the canonical payments schema:
 *
 *   Plaid transfer (debit)  → Charge   (money pulled in; addressed by transfer id)
 *   Plaid transfer (credit) → Payout   (money pushed out; addressed by transfer id)
 *   Plaid transfer refund   → Refund   (reverses a settled debit)
 *
 * Auth: a fixed `client_id` + `secret` pair (sent as PLAID-CLIENT-ID /
 * PLAID-SECRET headers), plus an optional per-Item `access_token` and the
 * environment (sandbox / production live on different hosts). No OAuth, no
 * token refresh — every credential is long-lived.
 *
 * Webhooks: ES256-JWT-signed deliveries in the `Plaid-Verification` header
 * (see ./webhook.ts).
 *
 * Resources deliberately left off (they auto-501): customers, payment methods,
 * subscriptions, invoices, disputes, plans / prices / products, balance
 * transactions — Plaid's Transfer product has no native equivalent (there is no
 * stored-customer, card-vault, recurring-billing, or merchant-ledger layer the
 * canonical schema maps onto).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, payout, refund
// Unavailable: balance-transaction — no merchant-ledger layer in Plaid Transfer product
// Unavailable: customer — no stored-customer vault; identity lives on an Item/access_token
// Unavailable: dispute — ACH returns map to refunded status on Charge; no chargeback object
// Unavailable: invoice — no invoicing or recurring-billing layer
// Unavailable: payment-method — no card-vault; bank accounts linked via Item/access_token
// Unavailable: plan — no subscription pricing or plan catalog
// Unavailable: subscription — no recurring-billing or subscription management layer

import type {
  BaseAdapter,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TRANSFER_GET_PATH,
  TRANSFER_LIST_PATH,
  TRANSFER_CREATE_PATH,
  TRANSFER_REFUND_GET_PATH,
  TRANSFER_REFUND_CREATE_PATH,
} from './constants'
import { FORM } from './auth'
import { PlaidClient } from './client'
import { parsePlaidWebhookEvents, verifyPlaidWebhook } from './webhook'

import { transformCharge, type RawPlaidTransfer } from './transform/charge'
import { transformPayout } from './transform/payout'
import { transformRefund, type RawPlaidRefund } from './transform/refund'

interface TransferEnvelope {
  transfer?: RawPlaidTransfer
  request_id?: string
}
interface TransferListEnvelope {
  transfers?: RawPlaidTransfer[]
  request_id?: string
}
interface RefundEnvelope {
  refund?: RawPlaidRefund
  request_id?: string
}

/** Decimal-string major units for a transfer create/refund body (`1234` → `"12.34"`). */
function minorToDecimal(minor: number | undefined): string | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  return (minor / 100).toFixed(2)
}

export class PlaidAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'plaid'
  readonly version = '0.1.0'

  /** pageSize() caps every list at 25; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Plaid uses a client_id + secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Plaid uses a client_id + secret; call exchangeCredentials instead.')
  }

  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Plaid credentials are long-lived; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPlaidWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePlaidWebhookEvents(payload)
  }

  private client(credentials: Credentials): PlaidClient {
    return new PlaidClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    return Math.min(Math.max(requested, 1), MAX_PAGE_SIZE)
  }

  private offset(params: QueryParams): number {
    if (typeof params.page === 'number' && params.page > 1) {
      return (params.page - 1) * this.pageSize(params)
    }
    return 0
  }

  // ── Charges (Plaid transfers) ─────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).post<TransferListEnvelope>(TRANSFER_LIST_PATH, {
      count: this.pageSize(params),
      offset: this.offset(params),
    })
    return (res.transfers ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<TransferEnvelope>(TRANSFER_GET_PATH, {
      transfer_id: id,
    })
    return transformCharge(res.transfer ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const raw = (data.raw ?? {}) as Record<string, unknown>
    const body: Record<string, unknown> = {
      type: 'debit',
      amount: minorToDecimal(data.amount),
      iso_currency_code: data.currency,
      description: data.description ?? undefined,
      ...raw, // pass-through for authorization_id, account_id, ach_class, user, network, etc.
    }
    const res = await this.client(credentials).post<TransferEnvelope>(TRANSFER_CREATE_PATH, body)
    return transformCharge(res.transfer ?? {})
  }

  // ── Payouts (Plaid credit transfers) ──────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const res = await this.client(credentials).post<TransferListEnvelope>(TRANSFER_LIST_PATH, {
      count: this.pageSize(params),
      offset: this.offset(params),
    })
    return (res.transfers ?? [])
      .filter((t) => (t.type ?? '').toLowerCase() === 'credit')
      .map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).post<TransferEnvelope>(TRANSFER_GET_PATH, {
      transfer_id: id,
    })
    return transformPayout(res.transfer ?? {})
  }

  // ── Refunds (Plaid transfer refunds) ──────────────────────────────────────

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).post<RefundEnvelope>(TRANSFER_REFUND_GET_PATH, {
      refund_id: id,
    })
    return transformRefund(res.refund ?? {}, res.refund?.['iso_currency_code'] as string | undefined)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Plaid transfer_id) is required for a refund.')
    const body: Record<string, unknown> = {
      transfer_id: data.chargeId,
      amount: minorToDecimal(data.amount),
    }
    const res = await this.client(credentials).post<RefundEnvelope>(TRANSFER_REFUND_CREATE_PATH, body)
    return transformRefund(res.refund ?? {}, data.currency)
  }
}
