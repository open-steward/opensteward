/**
 * Spreedly adapter — payments vertical (card-vault / payments orchestration).
 *
 * Spreedly is a PCI-compliant vault and orchestration layer in front of 100+
 * gateways. Its two core resources map cleanly onto the canonical schema:
 *
 *   - **Payment methods** — vaulted cards / bank accounts / wallets, addressed
 *     by a stable `token` (`GET /v1/payment_methods.json`).
 *   - **Transactions** — every money movement (Purchase, Authorization,
 *     Capture, Credit/Refund, Void) under one collection
 *     (`GET /v1/transactions.json`). Money-movement types map onto Charge;
 *     Credit/Refund types map onto Refund.
 *
 * Auth: HTTP basic — environment key (username) + access secret (password).
 * No OAuth, no token refresh (see auth.ts / client.ts).
 *
 * Refunds: there is no standalone `/refunds` collection. A refund is created
 * by crediting the original transaction
 * (`POST /v1/transactions/{token}/credit.json`), which returns a Credit
 * transaction — hence only `createRefund` is implemented.
 *
 * Methods deliberately left off (auto-501): customers (Spreedly vaults payment
 * methods, not customers), subscriptions, invoices, payouts, disputes,
 * plans/prices/products, balance transactions — Spreedly does not model these
 * as first-class REST resources.
 *
 * Webhooks: Spreedly "callbacks" are per-transaction state notifications sent
 * to a `callback_url`; there is no documented signing secret or signature
 * header, so no `verifyWebhook` / `parseWebhookEvents` is implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, payment-method, refund
// Unavailable: balance-transaction — Spreedly is a vault/orchestration layer with no ledger concept
// Unavailable: customer           — Spreedly vaults payment methods, not customers; no /customers endpoint
// Unavailable: dispute            — disputes are managed by the downstream gateway, not Spreedly
// Unavailable: invoice            — no invoicing or billing-lifecycle in Spreedly's API
// Unavailable: payout             — settlement is handled by the downstream gateway
// Unavailable: plan               — Spreedly sold its subscription product to Pin Payments; no plan endpoints remain
// Unavailable: subscription       — Spreedly sold its subscription product to Pin Payments; no subscription endpoints remain

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYMENT_METHODS_PATH,
  TRANSACTIONS_PATH,
  paymentMethodPath,
  transactionPath,
} from './constants'
import { buildCredentials } from './auth'
import { SpreedlyClient } from './client'

import { transformPaymentMethod, type RawSpreedlyPaymentMethod } from './transform/payment-method'
import { transformCharge, type RawSpreedlyTransaction } from './transform/charge'
import { transformRefund, type RawSpreedlyRefund } from './transform/refund'

/**
 * The pager scope for one connection: the environment key (stable, not a
 * secret) plus a fingerprint of the key and access secret together, so two
 * connections to one environment never share a walk (see `connectionScope`).
 */
function spreedlyScope(credentials: Credentials): string {
  const environmentKey = credentials.accessToken
  const accessSecret = String(
    (credentials.extra as Record<string, unknown> | undefined)?.accessSecret ?? '',
  )
  return connectionScope(`spreedly:${environmentKey}`, {
    accessToken: `${environmentKey}:${accessSecret}`,
  })
}

interface PaymentMethodEnvelope {
  payment_method?: RawSpreedlyPaymentMethod
}
interface TransactionEnvelope {
  transaction?: RawSpreedlyTransaction & RawSpreedlyRefund
}

export class SpreedlyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'spreedly'
  readonly version = '0.1.0'
  /** `count`: "By default returns 20, maximum allowed is 100." (list-payment-method, list-transactions) */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Spreedly uses HTTP basic auth; submit credentials via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Spreedly uses HTTP basic auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environmentKey',
        label: 'Environment key',
        type: 'text',
        required: true,
        placeholder: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
        helpText:
          'The environment key for the Spreedly environment you want to connect (used as the HTTP basic username).',
      },
      {
        name: 'accessSecret',
        label: 'Access secret',
        type: 'password',
        required: true,
        helpText:
          'An organization or single-environment access secret (used as the HTTP basic password). Create one under Settings → Access Secrets.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // HTTP basic credentials never expire; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): SpreedlyClient {
    return new SpreedlyClient(credentials)
  }

  /**
   * One caller page of a Spreedly list.
   *
   * Lists are keyset-paged by record token: `since_token` is "The token of the
   * item to start from (e.g., the last token received in the previous list if
   * iterating through records)", exclusive of that record; `count` is "By
   * default returns 20, maximum allowed is 100"; `order` flips asc↔desc.
   * https://developer.spreedly.com/reference/list-payment-method
   * https://developer.spreedly.com/reference/order-and-pagination
   *
   * The body carries no has_more or total, so a page shorter than `count` is
   * the last one, and a full page's last token starts the next. The 1-based
   * `page` is mapped onto that chain by {@link pageByCursor}, keyed per
   * connection, collection, order and size. A caller that passes a raw
   * `since_token` (or `cursor`) gets that one upstream page as-is.
   */
  private async pageList<R extends { token?: string }, K extends string>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    envelopeKey: K,
  ): Promise<R[]> {
    const raw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked = Number.isInteger(raw) && raw >= 1 ? raw : DEFAULT_PAGE_SIZE
    const count = Math.min(asked, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = { count }
    if (params.order === 'desc' || params['order'] === 'desc') query.order = 'desc'
    const client = this.client(credentials)

    const fetchPage = async (
      cursor: string | undefined,
    ): Promise<{ items: R[]; next?: string }> => {
      const res = await client.get<Partial<Record<K, R[]>>>(
        path,
        cursor === undefined ? query : { ...query, since_token: cursor },
      )
      const items = res[envelopeKey] ?? []
      const last = items.length >= count ? items[items.length - 1]?.token : undefined
      // A last token repeating the one just sent would loop; treat it as the end.
      return { items, next: last && last !== cursor ? last : undefined }
    }

    const rawCursor =
      typeof params.cursor === 'string'
        ? params.cursor
        : typeof params['since_token'] === 'string'
          ? params['since_token']
          : undefined

    let items: R[]
    let hasMore: boolean
    if (rawCursor !== undefined) {
      const res = await fetchPage(rawCursor)
      items = res.items
      hasMore = res.next !== undefined
    } else {
      const key = cursorPagerKey(spreedlyScope(credentials), path, query)
      ;({ items, hasMore } = await pageByCursor<R>(key, params.page, fetchPage))
    }
    reportUpstreamPage(params, count < asked ? { hasMore, pageSize: count } : { hasMore })
    return items
  }

  // ── Payment methods ─────────────────────────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const rows = await this.pageList<RawSpreedlyPaymentMethod, 'payment_methods'>(
      credentials,
      params,
      PAYMENT_METHODS_PATH,
      'payment_methods',
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<PaymentMethodEnvelope>(paymentMethodPath(id))
    return transformPaymentMethod(res.payment_method ?? {})
  }

  // ── Charges (Spreedly transactions) ──────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawSpreedlyTransaction, 'transactions'>(
      credentials,
      params,
      TRANSACTIONS_PATH,
      'transactions',
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<TransactionEnvelope>(transactionPath(id))
    return transformCharge(res.transaction ?? {})
  }

  // ── Refunds (credit the original transaction) ────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const referenceToken = data.chargeId
    if (!referenceToken) {
      throw new Error(
        'chargeId (the original Spreedly transaction token) is required for a refund.',
      )
    }
    const body: Record<string, unknown> = {}
    // Spreedly takes a partial-credit amount in minor units; omitting it credits in full.
    if (data.amount !== undefined) body.transaction = { amount: data.amount }
    const res = await this.client(credentials).post<TransactionEnvelope>(
      `/transactions/${referenceToken}/credit.json`,
      body,
    )
    const refundTx = res.transaction ?? {}
    // Default the back-reference to the credited transaction when upstream omits it.
    return transformRefund({ reference_token: referenceToken, ...refundTx })
  }
}
