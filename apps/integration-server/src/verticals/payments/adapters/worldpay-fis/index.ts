/**
 * Worldpay (FIS) adapter — payments vertical (enterprise EMEA card).
 *
 * Targets only the "Worldpay for Platforms" REST API at access.worldpay.com;
 * legacy SOAP merchants are not supported.
 *
 * Auth: either HTTP Basic (username:password) or OAuth2 client-credentials
 * (clientId + clientSecret) depending on the merchant's onboarding path.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer      — no customer profile endpoint; identity is carried by the token namespace only
 * Unavailable: invoice       — gateway-level API only; no invoice entity exists in the Access API
 * Unavailable: plan          — no plan resource; recurring payments use a payment-level customerAgreement
 * Unavailable: subscription  — no subscription management resource; recurring payments are per-transaction
 * Unverified:  dispute       — a separate Disputes Direct API product exists but requires distinct onboarding
 *                              and its endpoint/auth scheme could not be confirmed from public docs
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import { callerLimit, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { exchangeCredentials } from './auth'
import { WorldpayClient } from './client'
import { MAX_PAGE_SIZE, PAYOUTS_MAX_PAGE_SIZE, STATEMENTS_MAX_PAGE_SIZE } from './constants'
import {
  parseWorldpayWebhookEvents,
  verifyWorldpayWebhook,
} from './webhook'

import {
  transformBalanceTransaction,
  type RawWorldpayStatementsResponse,
} from './transform/balance-transaction'
import { transformCharge, type RawWorldpayPayment } from './transform/charge'
import { transformPaymentMethod, type RawWorldpayToken } from './transform/payment-method'
import { transformPayout, type RawWorldpayPayoutItem } from './transform/payout'
import { transformRefund, type RawWorldpayRefund } from './transform/refund'

export class WorldpayFisAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'worldpay-fis'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Worldpay uses API credentials; submit via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Worldpay uses API credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'try', label: 'Try (developer playground)' },
          { value: 'sandbox', label: 'UAT (pre-prod)' },
          { value: 'live', label: 'Production' },
        ],
      },
      {
        name: 'username',
        label: 'Username (Basic auth)',
        type: 'text',
        required: false,
        helpText: 'Leave blank if you want to use OAuth2 client-credentials below.',
      },
      { name: 'password', label: 'Password (Basic auth)', type: 'password', required: false },
      { name: 'clientId', label: 'Client ID (OAuth2)', type: 'text', required: false },
      { name: 'clientSecret', label: 'Client secret (OAuth2)', type: 'password', required: false },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    if (extra.authStyle === 'bearer' && extra.clientId && extra.clientSecret) {
      return exchangeCredentials({
        environment: String(extra.environment ?? 'try'),
        clientId: String(extra.clientId),
        clientSecret: String(extra.clientSecret),
      })
    }
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWorldpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWorldpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): WorldpayClient {
    return new WorldpayClient(credentials)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawWorldpayPayment>(`/payments/${id}`)
    return transformCharge(raw)
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    return []
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Worldpay paymentId) required for refund')
    const raw = await this.client(credentials).post<RawWorldpayRefund>(
      `/payments/${data.chargeId}/refunds`,
      data.amount
        ? { value: { amount: data.amount, currency: (data.currency ?? 'GBP').toUpperCase() } }
        : {},
    )
    return transformRefund({ ...raw, paymentId: data.chargeId })
  }

  // ── Payment methods (tokens) ─────────────────────────────────────────────

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // GET /tokens?tokenId={id} — response is HAL; token is in _embedded.tokens[0]
    const envelope = await this.client(credentials).get<Record<string, unknown>>(
      `/tokens?tokenId=${encodeURIComponent(id)}`,
    )
    const embedded = envelope._embedded as Record<string, unknown> | undefined
    const tokens = (embedded?.tokens as RawWorldpayToken[] | undefined) ?? []
    const raw = tokens[0] ?? ({ tokenId: id } as RawWorldpayToken)
    return transformPaymentMethod(raw)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    // GET /accountPayouts/events — pageNumber and pageSize [1..499] are both
    // required; the end is `pagination.pageCount`.
    const page = pageQuery(params, PAYOUTS_MAX_PAGE_SIZE)
    const qs = new URLSearchParams({
      pageNumber: String(page.pageNumber),
      pageSize: String(page.pageSize),
    }).toString()
    const envelope = await this.client(credentials).get<Record<string, unknown>>(
      `/accountPayouts/events?${qs}`,
    )
    const pagination = envelope.pagination as PageCounts | undefined
    reportPageCounts(params, page, pagination)
    const items = (envelope.items as RawWorldpayPayoutItem[] | undefined) ?? []
    return items.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawWorldpayPayoutItem>(
      `/accountPayouts/${encodeURIComponent(id)}`,
    )
    return transformPayout(raw)
  }

  // ── Balance transactions (statements) ────────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    // GET /accounts/statements requires accountNumber, startDate, endDate.
    // pageNumber and pageSize (1-500, default 500) page it; the end is the
    // top-level pageCount.
    const accountNumber = String(
      (params as Record<string, unknown>).accountNumber ?? '',
    )
    const startDate = String((params as Record<string, unknown>).startDate ?? '')
    const endDate = String((params as Record<string, unknown>).endDate ?? '')
    const page = pageQuery(params, STATEMENTS_MAX_PAGE_SIZE)
    const qs = new URLSearchParams({
      accountNumber,
      startDate,
      endDate,
      pageNumber: String(page.pageNumber),
      pageSize: String(page.pageSize),
    }).toString()
    const envelope = await this.client(credentials).get<RawWorldpayStatementsResponse>(
      `/accounts/statements?${qs}`,
    )
    reportPageCounts(params, page, envelope)
    return (envelope.accountStatementItems ?? []).map(transformBalanceTransaction)
  }
}

interface PageCounts {
  pageNumber?: number
  pageCount?: number
  totalNumberOfRecords?: number
}

/** The 1-based page and the size actually sent, clamped to the endpoint's maximum. */
function pageQuery(params: QueryParams, max: number): { pageNumber: number; pageSize: number } {
  const asked = callerLimit(params)
  const pageSize = Math.min(Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1), max)
  const p = params.page ?? 1
  const pageNumber = Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
  return { pageNumber, pageSize }
}

/** Report the size sent and, from the response's page counts, whether more pages follow. */
function reportPageCounts(
  params: QueryParams,
  sent: { pageNumber: number; pageSize: number },
  counts: PageCounts | undefined,
): void {
  const pageCount = counts?.pageCount
  const total = counts?.totalNumberOfRecords
  reportUpstreamPage(params, {
    pageSize: sent.pageSize,
    ...(typeof pageCount === 'number' ? { hasMore: sent.pageNumber < pageCount } : {}),
    ...(typeof total === 'number' ? { totalCount: total } : {}),
  })
}
