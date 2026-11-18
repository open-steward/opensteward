/**
 * FawryPay adapter — payments vertical (MENA anchor, Egypt-first).
 *
 * Fawry is Egypt's leading e-payments and digital-finance network. Its server
 * (ECommerceWeb) API is transaction-centric: you create a charge (PayAtFawry
 * reference number, card, or mobile wallet), look its state up by your own
 * merchant reference number, and refund a settled charge. There is NO
 * list/cursor surface and NO standalone customer object — customer contact
 * details are embedded on the charge — so the list* and customer* methods are
 * intentionally absent and auto-501 at the router.
 *
 * Resource coverage (what the Fawry server API actually exposes):
 *   - Charges:  create (POST /charge), get (GET /status/v2 — inquiry by
 *               merchantRefNumber)
 *   - Refunds:  create (POST /refund — full or partial)
 *
 * Auth: `api_key`-style — a `merchantCode` + a `secureKey`. There is no OAuth
 * and no Bearer token; each request carries a per-request SHA-256 `signature`
 * derived from selected fields + the `secureKey` (see auth.ts / client.ts).
 *
 * Webhooks: the "Server-to-Server Notification V2" callback carries a
 * `messageSignature` field (SHA-256 of selected fields + secureKey), verified
 * in webhook.ts.
 *
 * Methods deliberately left off (auto-501): payment methods, subscriptions,
 * invoices, payouts, disputes, plans/prices/products, balance transactions,
 * customers, and all list* surfaces — Fawry's server API does not model them.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — no ledger endpoint; fee data is embedded on the charge response only.
 * Unavailable: customer — no standalone customer object or CRUD; contact details are embedded on each charge.
 * Unavailable: dispute — no dispute/chargeback endpoints; handled through the merchant dashboard only.
 * Unavailable: invoice — Pay By Link e-invoice API is a separate product with incompatible auth (username/password JWT vs merchantCode+secureKey).
 * Unavailable: payment-method — no standalone payment-method CRUD; paymentMethod is a field on the charge request.
 * Unavailable: payout — no payout/settlement endpoints; merchant settlement is handled out-of-band by Fawry.
 * Unavailable: plan — no plan/price/product catalogue endpoints; no recurring billing plan concept in the server API.
 * Unavailable: subscription — no subscription management endpoints; recurring payments use bank installment options at charge creation.
 *
 * Docs: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { CHARGE_PATH, REFUND_PATH, STATUS_PATH } from './constants'
import { buildCredentials, merchantCodeFrom, secureKeyFrom } from './auth'
import {
  FawryClient,
  buildChargeSignature,
  buildRefundSignature,
  buildStatusSignature,
} from './client'
import { parseFawryWebhookEvents, verifyFawryWebhook } from './webhook'

import { transformCharge, type RawFawryCharge } from './transform/charge'
import { transformRefund, type RawFawryRefundResponse } from './transform/refund'
import { toMajorAmount } from './transform/shared'

export class FawryAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'fawry'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Fawry uses a merchant code + secure key; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Fawry uses a merchant code + secure key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantCode',
        label: 'Merchant code',
        type: 'text',
        required: true,
        helpText: 'Your FawryPay account merchant code (Fawry merchant dashboard).',
      },
      {
        name: 'secureKey',
        label: 'Secure key',
        type: 'password',
        required: true,
        helpText:
          'Your merchant secure hash key; used to sign each request (SHA-256). Never share or embed it in client code.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'staging', label: 'Staging (atfawry.fawrystaging.com)' },
          { value: 'production', label: 'Production (www.atfawry.com)' },
        ],
        helpText: 'A merchant code + secure key pair is bound to a single environment.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Merchant code + secure key never expire — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFawryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFawryWebhookEvents(payload)
  }

  private client(credentials: Credentials): FawryClient {
    return new FawryClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  /**
   * Look up a charge by the merchant reference number used when it was
   * created. Fawry has no GET-by-transaction-id; reads go through the
   * `status/v2` inquiry, signed with merchantCode + merchantRefNumber.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const merchantCode = merchantCodeFrom(credentials)
    const secureKey = secureKeyFrom(credentials)
    const signature = buildStatusSignature(
      { merchantCode, merchantRefNumber: id },
      secureKey,
    )
    const res = await this.client(credentials).get<RawFawryCharge>(STATUS_PATH, {
      merchantCode,
      merchantRefNumber: id,
      signature,
    })
    return transformCharge(res ?? {})
  }

  /**
   * Create a charge. Gateway-specific fields the canonical `Charge` can't carry
   * — `paymentMethod`, `customerMobile`, `customerEmail`, `chargeItems`,
   * `description`, `paymentExpiry`, `cardToken`, … — are supplied through
   * `data.raw`. Canonical fields layer on top: `amount` (minor units) →
   * Fawry's two-decimal `amount`; `metadata.merchantRefNumber` (or a generated
   * value) → `merchantRefNum`. The request signature is computed from the final
   * field values.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const merchantCode = merchantCodeFrom(credentials)
    const secureKey = secureKeyFrom(credentials)
    const supplied = (data.raw as Record<string, unknown> | undefined) ?? {}

    const merchantRefNum = String(
      supplied.merchantRefNum ?? data.metadata?.merchantRefNumber ?? data.id ?? Date.now(),
    )
    const paymentMethod = String(supplied.paymentMethod ?? 'PayAtFawry')
    const amount = data.amount != null ? toMajorAmount(data.amount) : toMajorAmount(0)
    const customerProfileId =
      supplied.customerProfileId != null
        ? String(supplied.customerProfileId)
        : data.customerId ?? undefined

    const signature = buildChargeSignature(
      { merchantCode, merchantRefNum, customerProfileId, paymentMethod, amount },
      secureKey,
    )

    const body: Record<string, unknown> = {
      ...supplied,
      merchantCode,
      merchantRefNum,
      paymentMethod,
      amount,
      ...(customerProfileId != null ? { customerProfileId } : {}),
      ...(data.description != null ? { description: data.description } : {}),
      ...(data.receiptEmail != null ? { customerEmail: data.receiptEmail } : {}),
      signature,
    }

    const res = await this.client(credentials).post<RawFawryCharge>(CHARGE_PATH, body)
    return transformCharge(res ?? {})
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  /**
   * Refund a settled charge (full or partial). `chargeId` is the Fawry
   * `referenceNumber`; `amount` is in minor units and is formatted to Fawry's
   * two-decimal major-unit string. The refund response carries only an outcome
   * envelope (no refund object), so the canonical refund is reconstructed from
   * the request values.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Fawry reference number) is required to refund.')
    const merchantCode = merchantCodeFrom(credentials)
    const secureKey = secureKeyFrom(credentials)
    const referenceNumber = data.chargeId
    const refundAmount = toMajorAmount(data.amount ?? 0)
    const reason = data.failureReason ?? undefined

    const signature = buildRefundSignature(
      { merchantCode, referenceNumber, refundAmount, reason },
      secureKey,
    )

    const body: Record<string, unknown> = {
      merchantCode,
      referenceNumber,
      refundAmount,
      ...(reason != null ? { reason } : {}),
      signature,
    }

    const res = await this.client(credentials).post<RawFawryRefundResponse>(REFUND_PATH, body)
    return transformRefund(res ?? {}, {
      chargeId: referenceNumber,
      amount: data.amount,
      currency: data.currency,
      reason,
    })
  }
}
