/**
 * Fiserv Commerce Hub adapter — payments vertical.
 *
 * Commerce Hub is Fiserv's modern unified payments REST API. It is
 * transaction-centric: every operation is a POST, and reads are point lookups
 * via `transaction-inquiry` keyed by a reference transaction id. There is NO
 * list/cursor surface, NO standalone customer object, and NO refund-read
 * endpoint, so the list* / customer* / get*Refund methods are intentionally
 * absent and auto-501 at the router.
 *
 * Resource coverage (what Commerce Hub actually exposes):
 *   - Charges:  create (POST /payments/v1/charges — sale or auth-only via
 *               `transactionDetails.captureFlag`), get (POST
 *               /payments/v1/transaction-inquiry), capture (POST
 *               /payments/v1/charges — referenceTransactionDetails +
 *               `transactionDetails.captureFlag: true`), cancel/void (POST
 *               /payments/v1/cancels)
 *   - Refunds:  create (POST /payments/v1/refunds — full or partial)
 *
 * Auth: `api_key` — API key + API secret, with a per-request HMAC-SHA256
 * message signature (see auth.ts / client.ts). No OAuth, no Bearer token.
 *
 * Commerce Hub's core payments API does not publish an inbound webhook
 * signature scheme, so this adapter exposes no webhook verification/parsing.
 *
 * Docs: https://developer.fiserv.com/product/CommerceHub
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge — create (POST /payments/v1/charges), get (POST /payments/v1/transaction-inquiry),
//              capture (POST /payments/v1/charges, captureFlag=true), cancel (POST /payments/v1/cancels)
//              refund  — create (POST /payments/v1/refunds)
// Unavailable: balance-transaction — no ledger/balance reporting surface in Commerce Hub
// Unavailable: customer            — no customer vault or CRUD; tokens are per-transaction inline
// Unavailable: dispute             — dispute management is a separate Fiserv product (Control Center/Exchange)
// Unavailable: invoice             — no billing/invoicing layer in Commerce Hub
// Unavailable: payment-method      — no standalone payment-method list/get/detach; tokenization only
// Unavailable: payout              — no payout/settlement reporting API; handled by Fiserv back-office
// Unavailable: plan                — no plan/price/product concept; /payment-schedules is a different Fiserv product
// Unavailable: subscription        — no subscription management; /payment-schedules not part of Commerce Hub

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'

import {
  CANCELS_PATH,
  CHARGES_PATH,
  REFUNDS_PATH,
  TRANSACTION_INQUIRY_PATH,
} from './constants'
import { buildCredentials, merchantDetails } from './auth'
import { FiservClient } from './client'

import { transformCharge, type RawFiservTransaction } from './transform/charge'
import { transformRefund } from './transform/refund'
import { toMajorUnits } from './transform/shared'

export class FiservAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'fiserv'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Fiserv uses an API key + secret; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Fiserv uses an API key + secret; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'text',
        required: true,
        helpText: 'Commerce Hub Api-Key from the Fiserv Developer Portal (per environment).',
      },
      {
        name: 'apiSecret',
        label: 'API secret',
        type: 'password',
        required: true,
        helpText: 'Secret key issued alongside the Api-Key; used to sign each request (HMAC-SHA256).',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: false,
        helpText:
          'Optional. Commerce Hub merchant id, sent as merchantDetails.merchantId. Fiserv marks it optional in the schema but sends it in its own examples; multi-merchant accounts may require it. Leave blank unless your account needs it.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (cert)' },
          { value: 'production', label: 'Production' },
        ],
        helpText: 'Sandbox uses cert.api.fiservapps.com; production uses prod.api.fiservapps.com.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key + secret never expire — nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): FiservClient {
    return new FiservClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  /**
   * Look up a transaction by its Commerce Hub transaction id. Commerce Hub
   * has no GET endpoint; reads go through the `transaction-inquiry` POST
   * keyed by `referenceTransactionId`. Its response is a top-level *array*
   * of matching transactions (not `{paymentTransactions:[...]}`); take the
   * most recent entry.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawFiservTransaction[]>(
      TRANSACTION_INQUIRY_PATH,
      {
        referenceTransactionDetails: { referenceTransactionId: id },
        ...merchantDetails(credentials),
      },
    )
    const txns = Array.isArray(res) ? res : []
    const txn = txns[txns.length - 1]
    if (!txn) {
      throw Object.assign(new Error(`Fiserv: no transaction found for reference id ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformCharge(txn)
  }

  /**
   * Create a charge. `transactionDetails.captureFlag` decides sale (true) vs
   * auth-only (false); defaults to a sale. The card/source block is richer
   * than the canonical `Charge` allows (PAN, 3DS, tokenized source, …), so
   * the gateway-specific `source` and any extra fields are supplied through
   * `data.raw`. Canonical fields layer on top: `amount` → `amount.total`
   * (converted to Commerce Hub's decimal major units), `currency` →
   * `amount.currency`.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const supplied = (data.raw as Record<string, unknown> | undefined) ?? {}
    const suppliedAmount = (supplied.amount as Record<string, unknown> | undefined) ?? {}
    const suppliedDetails = (supplied.transactionDetails as Record<string, unknown> | undefined) ?? {}
    const currency = data.currency ?? (suppliedAmount.currency as string | undefined) ?? 'USD'

    const body: Record<string, unknown> = {
      ...supplied,
      amount: {
        ...suppliedAmount,
        ...(data.amount != null ? { total: toMajorUnits(data.amount, currency) } : {}),
        currency,
      },
      transactionDetails: {
        captureFlag: true,
        ...suppliedDetails,
        ...(data.captured != null ? { captureFlag: data.captured } : {}),
      },
    }

    const res = await this.client(credentials).post<RawFiservTransaction>(CHARGES_PATH, body)
    return transformCharge(res ?? {})
  }

  /**
   * Capture a previously authorised charge. Optional partial amount in minor
   * units. Commerce Hub has no separate `/captures` endpoint — a capture is a
   * POST to `/payments/v1/charges` carrying `referenceTransactionDetails`
   * (the original transaction id) plus `transactionDetails.captureFlag: true`.
   */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {
      referenceTransactionDetails: { referenceTransactionId: id },
      transactionDetails: { captureFlag: true },
      ...merchantDetails(credentials),
    }
    if (data?.amount != null) {
      // Re-query for the currency, then convert minor → Commerce Hub major units.
      const existing = await this.getCharge(credentials, id)
      body.amount = { total: toMajorUnits(data.amount, existing.currency), currency: existing.currency }
    }
    const res = await this.client(credentials).post<RawFiservTransaction>(CHARGES_PATH, body)
    return transformCharge(res ?? {})
  }

  /** Void an authorised-but-uncaptured charge. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawFiservTransaction>(CANCELS_PATH, {
      referenceTransactionDetails: { referenceTransactionId: id },
      ...merchantDetails(credentials),
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  /**
   * Refund a settled charge. A full refund omits `amount`; a partial refund
   * passes the amount converted to Commerce Hub's decimal major units. There
   * is no refund object to list or fetch afterward, so only `createRefund` is
   * exposed.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Fiserv transaction id) is required to refund.')
    const body: Record<string, unknown> = {
      referenceTransactionDetails: { referenceTransactionId: data.chargeId },
    }
    if (data.amount != null) {
      const currency = data.currency ?? 'USD'
      body.amount = { total: toMajorUnits(data.amount, currency), currency }
    }
    const res = await this.client(credentials).post<RawFiservTransaction>(REFUNDS_PATH, body)
    return transformRefund(res ?? {}, {
      chargeId: data.chargeId,
      amount: data.amount,
      currency: data.currency,
    })
  }
}
