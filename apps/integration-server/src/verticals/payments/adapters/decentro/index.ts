/**
 * Decentro adapter — payments vertical (India, UPI / banking-as-a-service).
 *
 * Decentro exposes UPI collections, payouts, virtual accounts, KYC, and bank
 * verification over a header-authenticated REST API. For the canonical payments
 * vertical we map the pieces that have a clean equivalent:
 *
 *   • Charge  — a UPI collection. `createCharge` issues a UPI payment link
 *     (POST /v3/payments/upi/link); `getCharge` reads its status by Decentro
 *     transaction id (GET /v2/payments/transaction/status).
 *   • Refund  — a UPI refund against a collection (POST /v2/payments/upi/refund).
 *   • Payout  — a bank/UPI payout (POST /v3/core_banking/money_transfer/initiate);
 *     `getPayout` fetches its status (GET /core_banking/money_transfer/get_status).
 *
 * Decentro has no "customer" object and no list endpoints for these resources
 * (collections are looked up by the id you receive at creation time), so
 * `listCustomers` / `listCharges` / `listRefunds` / `listPayouts` are
 * intentionally absent — the router returns 501 for them. Decentro does not sign
 * its callbacks, so there is no webhook verification.
 *
 * Auth: API key (client_id + client_secret + module_secret + provider_secret
 * headers). Submit via the Connect Link form.
 *
 * Docs: https://docs.decentro.tech/docs/payments-overview-and-guide
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: customer       — Decentro has no customer object; payers are identified by UPI VPA or consumer URN
 * Unavailable: payment-method — Decentro is UPI/bank-transfer only; no stored payment method concept
 * Unavailable: dispute        — Decentro has no dispute or chargeback endpoint
 * Unavailable: invoice        — Decentro is not a billing platform; no invoice endpoint
 * Unavailable: plan           — No subscription plan management
 * Unavailable: subscription   — No subscription management
 * Unavailable: balance-transaction — Decentro has a virtual-account statement endpoint but its response schema is not publicly documented; exact field names unconfirmed
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'

import {
  CREATE_PAYMENT_LINK_PATH,
  PAYOUT_STATUS_PATH,
  TRANSACTION_STATUS_PATH,
  UPI_REFUND_PATH,
} from './constants'
import { buildCredentials } from './auth'
import { DecentroClient } from './client'

import { transformCharge, type RawDecentroCharge } from './transform/charge'
import { transformPayout, type RawDecentroPayout } from './transform/payout'
import { transformRefund, type RawDecentroRefund } from './transform/refund'

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'Found on the Decentro dashboard under API credentials.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
  },
  {
    name: 'moduleSecret',
    label: 'Module secret',
    type: 'password',
    required: true,
    helpText: 'The secret for the Payments module.',
  },
  {
    name: 'providerSecret',
    label: 'Provider secret',
    type: 'password',
    required: false,
    helpText: 'Required for transaction-status and UPI-refund calls.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'staging', label: 'Staging (sandbox)' },
      { value: 'production', label: 'Production' },
    ],
  },
]

const FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  exchange: async (fields) => buildCredentials(fields),
})

export class DecentroAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'decentro'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Decentro uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Decentro uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Header credentials never expire — nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): DecentroClient {
    return new DecentroClient(credentials)
  }

  // ── Charges (UPI collections) ──────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawDecentroCharge>(TRANSACTION_STATUS_PATH, {
      transaction_id: id,
    })
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const meta = (data.metadata ?? {}) as Record<string, string>
    const referenceId = meta.reference_id ?? meta.referenceId ?? `os-${Date.now()}`
    // Decentro takes the amount in decimal rupees; the canonical schema stores
    // integer minor units (paise), so divide by 100 on the way out.
    const amount = data.amount != null ? data.amount / 100 : undefined
    const body: Record<string, unknown> = {
      reference_id: referenceId,
      amount,
      purpose_message: data.description ?? meta.purpose_message,
      consumer_urn: meta.consumer_urn,
      expiry_time: meta.expiry_time,
      generate_psp_uri: meta.generate_psp_uri === 'true' ? true : undefined,
    }
    const res = await this.client(credentials).post<RawDecentroCharge>(
      CREATE_PAYMENT_LINK_PATH,
      body,
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds (UPI refunds) ──────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required for a Decentro UPI refund.')
    const meta = (data.metadata ?? {}) as Record<string, string>
    const body: Record<string, unknown> = {
      reference_id: meta.reference_id ?? `os-refund-${Date.now()}`,
      transaction_id: data.chargeId,
      purpose_message: meta.purpose_message,
    }
    const res = await this.client(credentials).post<RawDecentroRefund>(UPI_REFUND_PATH, body)
    return transformRefund(res ?? {}, { chargeId: data.chargeId, amount: data.amount })
  }

  // ── Payouts (bank/UPI transfers) ───────────────────────────────────────────

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawDecentroPayout>(PAYOUT_STATUS_PATH, {
      decentro_txn_id: id,
    })
    return transformPayout(res ?? {})
  }
}
