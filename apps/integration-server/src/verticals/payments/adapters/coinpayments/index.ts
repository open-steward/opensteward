/**
 * CoinPayments adapter — payments vertical (crypto-checkout anchor).
 *
 * CoinPayments is a cryptocurrency payment gateway: merchants accept 100+
 * coins via hosted **invoices** (and Buy-Now buttons / white-label checkout),
 * settle into custodial **wallets**, and send funds out with **spend requests**.
 * Its v2 REST API exposes those primitives rather than card-style charges, so we
 * map them onto the canonical payments resources:
 *
 *   - invoices            (crypto payment requests)  → Charges  (list, get, create, cancel)
 *   - wallet transactions (on-chain ledger entries)  → BalanceTransactions (list)
 *
 * Outgoing spend requests are surfaced inside the wallet-transaction ledger
 * (as `payout`-typed balance transactions) rather than as a separate canonical
 * Payout, since the payments interface only exposes list/get for payouts and
 * CoinPayments has no list/get spend resource. CoinPayments also has no
 * customer, refund, subscription, invoice-line-item, dispute, or
 * plan/price/product resource, so those methods are intentionally absent and
 * the router auto-returns 501 for them.
 *
 * Auth: API-key request-signing — three headers
 * (`X-CoinPayments-Client`/`-Timestamp`/`-Signature`) where the signature is
 * `Base64(HMAC-SHA256(clientSecret, BOM + method + url + clientId + timestamp +
 * body))`. Collected through the Connect Link form (client ID + client secret);
 * see `./auth.ts`.
 *
 * Webhooks: signed with the same recipe (in reverse); both `verifyWebhook` and
 * `parseWebhookEvents` are implemented — see `./webhook.ts`.
 *
 * Docs: https://docs.coinpayments.net/api/
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   balance-transaction — wallet transaction ledger entries
//              charge              — CoinPayments invoices (crypto payment requests)
// Unavailable: customer       — no customer object; buyer details are embedded in the invoice
// Unavailable: dispute        — no dispute/chargeback concept; crypto payments are irreversible
// Unavailable: invoice        — CoinPayments "invoices" are mapped to Charge; no recurring-billing Invoice
// Unavailable: payment-method — no stored payment-method object; buyers choose coin at hosted checkout
// Unavailable: payout         — spend requests have no list/get endpoint; outgoing txns appear in balance-transaction
// Unavailable: plan           — no subscription billing plane, price, or product catalog
// Unavailable: refund         — no refund object; crypto payments are irreversible
// Unavailable: subscription   — no subscription or recurring-billing resource

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { CoinpaymentsClient, type CoinpaymentsPaged } from './client'
import { verifyCoinpaymentsWebhook, parseCoinpaymentsWebhookEvents } from './webhook'

import { transformCharge, type RawCoinpaymentsInvoice } from './transform/charge'
import {
  transformBalanceTransaction,
  type RawCoinpaymentsWalletTransaction,
} from './transform/balance-transaction'

export class CoinpaymentsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'coinpayments'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error(
      'CoinPayments uses API-key request-signing; submit credentials via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('CoinPayments uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ────────────────────────────────────────────────────────────--

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCoinpaymentsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCoinpaymentsWebhookEvents(payload)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────--

  private client(credentials: Credentials): CoinpaymentsClient {
    return new CoinpaymentsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      perPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params['status'] === 'string') out.status = params['status']
    return out
  }

  // ── Charges (CoinPayments invoices) ─────────────────────────────────────---

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<CoinpaymentsPaged<RawCoinpaymentsInvoice>>(
      '/v2/merchant/invoices',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawCoinpaymentsInvoice>(
      `/v2/merchant/invoices/${id}`,
    )
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined || !data.currency) {
      throw new Error('amount and currency are required to create a CoinPayments invoice.')
    }
    const res = await this.client(credentials).post<RawCoinpaymentsInvoice>(
      '/v2/merchant/invoices',
      {
        currency: data.currency,
        amount: { value: String(data.amount) },
        ...(data.description ? { notesToRecipient: data.description } : {}),
        ...(data.receiptEmail ? { buyer: { emailAddress: data.receiptEmail } } : {}),
      },
    )
    return transformCharge(res ?? {})
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawCoinpaymentsInvoice>(
      `/v2/merchant/invoices/${id}/cancel`,
    )
    return transformCharge(res ?? {})
  }

  // ── Balance transactions (CoinPayments wallet transaction history) ─────────-

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const walletId = String(params['walletId'] ?? '')
    if (!walletId) {
      throw new Error('walletId is required to list CoinPayments wallet transactions.')
    }
    const res = await this.client(credentials).get<
      CoinpaymentsPaged<RawCoinpaymentsWalletTransaction>
    >(`/v2/merchant/wallets/${walletId}/transactions`, this.listParams(params))
    return (res.items ?? []).map(transformBalanceTransaction)
  }
}
