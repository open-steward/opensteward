/**
 * 2C2P Payment Gateway adapter — payments vertical (Southeast Asia anchor).
 *
 * 2C2P (a.k.a. 2C2P / "Cash, Card, Plus Payment") is the leading SE-Asia
 * gateway — Thailand, Singapore, Malaysia, Indonesia, the Philippines, Vietnam,
 * Hong Kong. Methods: cards, local bank transfer, e-wallets, QR, installments.
 *
 * Resource surface — deliberately narrow. 2C2P's REST model is transaction-
 * centric and JWS-signed: the only read-shaped endpoint reachable with the
 * merchant Secret Key alone is **Payment Inquiry**, which returns ONE
 * transaction keyed by the merchant `invoiceNo`. There is no list-all endpoint,
 * no standalone Customers API, and refunds run through a separate JWE+JWS
 * (RSA) Payment Action channel that needs an X.509 key pair — not reachable
 * with the HS256 api_key flow this adapter uses. So this adapter implements
 * charges only:
 *   - `getCharge(id)`            → Payment Inquiry; `id` is the `invoiceNo`.
 *   - `listCharges({ invoiceNo })` → single-element inquiry; `[]` when omitted.
 * Every other resource method is left off and auto-501s.
 *
 * Auth: a merchant key pair (no OAuth). The Secret Key signs each request JWS
 * (HS256) and verifies the backend-notification JWS. `merchantID` + the chosen
 * environment travel in `Credentials.extra`.
 *
 * Money: 2C2P quotes MAJOR units as decimals (D 12,5); the canonical schema is
 * integer minor units, so transforms scale by 100.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:    charge — Payment Inquiry (HS256 JWT, keyed by invoiceNo)
// Unavailable:  balance-transaction — Balance Inquiry uses JWS PS256, different auth channel
// Unavailable:  customer — no standalone Customer API; customerToken is a transaction attribute
// Unavailable:  dispute — no dispute/chargeback API; handled manually by 2C2P ops
// Unavailable:  invoice — no invoice resource; Payment Instruction is for end-user directions
// Unavailable:  payment-method — Card Token API requires JWE+JWS RSA keys, not reachable with the HS256 api_key flow
// Unavailable:  payout — Payout Inquiry (HS256) keyed by merchant requestID with no list-all
// Unavailable:  plan — no Plan/Price/Product API; RPP params embedded in Payment Token
// Unavailable:  refund — Payment Maintenance requires JWE+JWS RSA X.509 key pair, not reachable with the HS256 api_key flow
// Unavailable:  subscription — RPP single-record inquiry only, uses JWE+JWS exchange key

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { WebhookEvent } from '../../schema/webhook'

import { PAYMENT_INQUIRY_PATH } from './constants'
import { buildCredentials } from './auth'
import { TwoC2PClient } from './client'
import { parseTwoC2PWebhookEvents, verifyTwoC2PWebhook } from './webhook'
import { transformCharge, type RawTwoC2PTransaction } from './transform/charge'

export class TwoC2PAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = '2c2p'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      '2C2P uses a merchant key pair; submit the merchant ID + secret key via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('2C2P uses a merchant key pair; call exchangeCredentials instead.')
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
        name: 'merchantID',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'Your 2C2P merchant ID. Sent as the merchantID claim in every request JWS.',
      },
      {
        name: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText:
          'Merchant Secret Key from the 2C2P Merchant Portal. Signs each request JWS (HS256) and verifies backend notifications.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTwoC2PWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTwoC2PWebhookEvents(payload)
  }

  private client(credentials: Credentials): TwoC2PClient {
    return new TwoC2PClient(credentials)
  }

  // ── Charges (Payment Inquiry) ─────────────────────────────────────────────

  /** Inquire a transaction by merchant invoice number. `id` = `invoiceNo`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const claims = await this.client(credentials).signedPost(PAYMENT_INQUIRY_PATH, {
      invoiceNo: id,
      locale: 'en',
    })
    return transformCharge(claims as RawTwoC2PTransaction)
  }

  /**
   * List charges. 2C2P has no global payment list — inquiry is keyed by a
   * single `invoiceNo` — so this resolves a one-element list when an
   * `invoiceNo` (or `id`) param is supplied, and `[]` otherwise.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const invoiceNo =
      typeof params.invoiceNo === 'string'
        ? params.invoiceNo
        : typeof params.id === 'string'
          ? params.id
          : undefined
    if (!invoiceNo) return []
    return [await this.getCharge(credentials, invoiceNo)]
  }
}
