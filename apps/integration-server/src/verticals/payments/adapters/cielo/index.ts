/**
 * Cielo adapter — payments vertical (Brazil anchor).
 *
 * Cielo is Brazil's largest card acquirer; its "eCommerce API 3.0" is a
 * transaction-centric REST surface (no list/cursor endpoints — every read is
 * a point lookup by PaymentId). Methods: credit card, debit card (EMV 3DS),
 * Pix. Settlement is BRL; amounts are integer centavos.
 *
 * Auth: dual static headers — `MerchantId` (store GUID) + `MerchantKey`
 * (40-char secret). No OAuth, no Bearer token.
 *
 * Resource coverage (what Cielo actually exposes):
 *   - Charges:  create (POST /1/sales), get (GET /1/sales/{id}),
 *               capture (PUT …/capture), cancel/void (PUT …/void)
 *   - Refunds:  create (PUT …/void with ?amount=) — Cielo models a refund as
 *               a partial/full void; there is no refund object to list or get.
 *
 * Cielo has NO list endpoint, NO standalone customer object, and NO
 * refund-read endpoint, so listCharges / listCustomers / getCustomer /
 * listRefunds / getRefund are intentionally absent and auto-501 at the router.
 *
 * Docs: https://developercielo.github.io/manual/cielo-ecommerce
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — no ledger/settlement REST API; handled via merchant portal only
// Unavailable: customer           — no standalone customer object; buyer details are embedded per-sale
// Unavailable: dispute            — no chargeback/dispute REST endpoint; managed via merchant portal
// Unavailable: invoice            — no invoicing API; Cielo is a card acquirer only
// Unavailable: payment-method     — tokenization exists per-transaction but no list/get endpoint for stored methods
// Unavailable: payout             — no settlement/payout REST API
// Unavailable: plan               — no plan/price catalog; recurring billing is a per-transaction flag
// Unavailable: subscription       — GET /1/RecurrentPayment/{id} is a point-lookup only; no list endpoint

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { SALES_PATH } from './constants'
import { buildCredentials } from './auth'
import { CieloClient } from './client'
import { parseCieloWebhookEvents, verifyCieloWebhook } from './webhook'

import { transformCharge, type RawCieloSale } from './transform/charge'
import { transformRefund, type RawCieloVoid } from './transform/refund'

export class CieloAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'cielo'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Cielo uses MerchantId/MerchantKey; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Cielo uses MerchantId/MerchantKey; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantId',
        label: 'MerchantId',
        type: 'text',
        required: true,
        helpText: 'Store identifier (GUID, 36 chars) issued by Cielo.',
      },
      {
        name: 'merchantKey',
        label: 'MerchantKey',
        type: 'password',
        required: true,
        helpText: 'Secret key (40 chars) issued alongside the MerchantId.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'production', label: 'Production' },
        ],
        helpText: 'Sandbox uses apisandbox.*; production uses api.cieloecommerce.*.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static header credentials never expire — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCieloWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCieloWebhookEvents(payload)
  }

  private client(credentials: Credentials): CieloClient {
    return new CieloClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).query<RawCieloSale>(`${SALES_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  /**
   * Create a sale. Cielo's create payload is card-/method-specific and richer
   * than the canonical `Charge` allows (it needs `Payment.CreditCard`,
   * `Payment.Type`, `Payment.Installments`, etc.), so the gateway-specific
   * body is supplied through `data.raw`. The canonical fields layer on top:
   * `amount` → `Payment.Amount`, `currency` → `Payment.Currency`,
   * `receiptEmail` → `Customer.Email`.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const supplied = (data.raw as Record<string, unknown> | undefined) ?? {}
    const suppliedCustomer = (supplied.Customer as Record<string, unknown> | undefined) ?? {}
    const suppliedPayment = (supplied.Payment as Record<string, unknown> | undefined) ?? {}

    const body: Record<string, unknown> = {
      MerchantOrderId: supplied.MerchantOrderId ?? data.id ?? `oi_${Date.now()}`,
      ...supplied,
      Customer: {
        ...suppliedCustomer,
        ...(data.receiptEmail ? { Email: data.receiptEmail } : {}),
      },
      Payment: {
        Type: 'CreditCard',
        ...suppliedPayment,
        ...(data.amount != null ? { Amount: data.amount } : {}),
        ...(data.currency ? { Currency: data.currency } : {}),
      },
    }

    const res = await this.client(credentials).post<RawCieloSale>(`${SALES_PATH}/`, body)
    return transformCharge(res ?? {})
  }

  /** Finalise an authorised (uncaptured) sale. Optional partial amount in centavos. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const params = data?.amount != null ? { amount: data.amount } : undefined
    await this.client(credentials).put<RawCieloVoid>(`${SALES_PATH}/${id}/capture`, params)
    // Cielo's capture response is a thin status body; re-query for the full sale.
    return this.getCharge(credentials, id)
  }

  /** Void an authorised-but-uncaptured sale (full cancellation). */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).put<RawCieloVoid>(`${SALES_PATH}/${id}/void`)
    return this.getCharge(credentials, id)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  /**
   * Refund a captured sale. Cielo models this as a void: full refund omits the
   * amount, a partial refund passes `?amount=<centavos>`. There is no refund
   * object to list or fetch afterward, so only `createRefund` is exposed.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Cielo PaymentId) is required to refund.')
    const params = data.amount != null ? { amount: data.amount } : undefined
    const res = await this.client(credentials).put<RawCieloVoid>(
      `${SALES_PATH}/${data.chargeId}/void`,
      params,
    )
    return transformRefund(res ?? {}, {
      chargeId: data.chargeId,
      amount: data.amount ?? 0,
      currency: data.currency,
    })
  }
}
