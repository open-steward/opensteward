/**
 * Moyasar adapter — payments vertical.
 *
 * Auth: HTTP Basic, API key as username and an empty password
 * (https://docs.moyasar.com/api/authentication).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer — Moyasar has no customer resource; no /customers path in the API docs or the first-party Postman collection
 * Unavailable: refund (list) — refunds are only POST /payments/:id/refund, which returns the payment; there is no refund object or refund list
 * Unavailable: balance-transaction — Moyasar exposes batch-level settlement records (GET /settlements), not per-transaction balance entries
 * Unavailable: dispute — no dispute/chargeback API in Moyasar REST documentation
 * Unavailable: plan — no subscription billing plans API; recurring payments are handled via tokens, not a plans API
 * Unavailable: subscription — no native subscription management API; WooCommerce plugin uses token-based recurrence only
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { MoyasarClient } from './client'
import { verifyMoyasarWebhook, parseMoyasarWebhookEvents } from './webhook'

import { transformCharge, type RawMoyasarPayment } from './transform/charge'
import { transformRefund, type RawMoyasarRefund } from './transform/refund'
import { transformInvoice, type RawMoyasarInvoice } from './transform/invoice'
import { transformPayout, type RawMoyasarPayout } from './transform/payout'
import { transformPaymentMethod, type RawMoyasarToken } from './transform/payment-method'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** A page of a Moyasar list: rows under a resource key, plus `meta`. */
interface MoyasarMeta {
  current_page?: number
  next_page?: number | null
}

/**
 * Walk a Moyasar list by `page` and cut the caller's rows out of it.
 *
 * https://docs.moyasar.com/api/pagination: "If you do not specify the page,
 * you will receive the first page of this stream, containing the newest
 * objects. The stream of objects will return 40 objects for the requested
 * resource by default and an object containing meta-information about the
 * list." `meta.next_page` is "The next page number if any, otherwise null".
 * `page` is the only documented paging parameter; no page size exists, so one
 * upstream page (40 rows) is not one caller page. pageByRows reports
 * `hasMore` exactly.
 */
async function pageList<R>(
  client: MoyasarClient,
  credentials: Credentials,
  path: string,
  key: string,
  params: QueryParams,
): Promise<R[]> {
  const pagerKey = cursorPagerKey(connectionScope(API_BASE_URL, credentials), path, {})
  const { items } = await pageByRows<R, number>(
    pagerKey,
    params,
    async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<Record<string, unknown> & { meta?: MoyasarMeta }>(path, {
        page,
      })
      const rows = res?.[key]
      const next = res?.meta?.next_page
      return {
        items: Array.isArray(rows) ? (rows as R[]) : [],
        next: typeof next === 'number' && next > page ? next : undefined,
      }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class MoyasarAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'moyasar'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Moyasar uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Moyasar uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Secret Key',
        type: 'password',
        required: true,
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
    return verifyMoyasarWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMoyasarWebhookEvents(payload)
  }

  private client(credentials: Credentials): MoyasarClient {
    return new MoyasarClient(credentials)
  }

  /**
   * Moyasar has no customer resource: the API reference
   * (https://docs.moyasar.com/api/api-introduction) and the first-party Postman
   * collection list payments, invoices, payout accounts, payouts, settlements,
   * transfers, tokens and webhooks, and no /customers path.
   */
  async listCustomers(): Promise<never> {
    throw notSupported(
      'Moyasar cannot list customers: the Moyasar API has no customer resource (no /customers endpoint is documented).',
    )
  }

  async getCustomer(): Promise<never> {
    throw notSupported(
      'Moyasar cannot fetch customers: the Moyasar API has no customer resource (no /customers endpoint is documented).',
    )
  }

  /**
   * GET /payments (https://docs.moyasar.com/api/payments/03-list-payments):
   * "List all payments on your Moyasar account with pagination, including each
   * payment's status, amount, source, and metadata." Query "page int32 Default
   * value: 1 Page to list"; response `{ payments: [...], meta: {...} }`.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await pageList<RawMoyasarPayment>(
      this.client(credentials),
      credentials,
      '/payments',
      'payments',
      params,
    )
    return rows.map(transformCharge)
  }

  /**
   * GET /payments/:id (https://docs.moyasar.com/api/payments/02-fetch-payment):
   * "Retrieve a single Moyasar payment by its ID"; the 200 body is the payment.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawMoyasarPayment>(
      `/payments/${encodeURIComponent(id)}`,
    )
    return transformCharge(res)
  }

  /**
   * https://docs.moyasar.com/api/payments/05-refund-payment: the only refund
   * operation is POST /payments/:id/refund, which "Refund[s] a captured Moyasar
   * payment in full or partially" and returns the payment, not a refund object.
   */
  async listRefunds(): Promise<never> {
    throw notSupported(
      'Moyasar cannot list refunds: refunds exist only as POST /payments/:id/refund, which returns the payment; there is no refund resource or refund list endpoint.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawMoyasarRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await pageList<RawMoyasarInvoice>(
      this.client(credentials),
      credentials,
      '/invoices',
      'invoices',
      params,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawMoyasarInvoice>(`/invoices/${id}`)
    return transformInvoice(res)
  }

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await pageList<RawMoyasarPayout>(
      this.client(credentials),
      credentials,
      '/payouts',
      'payouts',
      params,
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawMoyasarPayout>(`/payout/${id}`)
    return transformPayout(res)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawMoyasarToken>(`/tokens/${id}`)
    return transformPaymentMethod(res)
  }
}
