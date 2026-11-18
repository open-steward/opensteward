/**
 * NearPay adapter — payments vertical.
 *
 * Auth: API key in an `api-key` header (see ./auth.ts).
 * Host: the Accounts API, `https://api.nearpay.io/v1/clients-sdk` (see ./constants.ts).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge — GET /transactions and GET /transactions/{transaction_id}
// Unavailable: customer — NearPay documents no customers resource on any of its APIs
// Unavailable: refund — NearPay documents no refunds list; a refund is a terminal session, not a listable resource
// Unavailable: balance-transaction — NearPay has no balance-transaction ledger API; it is a SoftPOS/Tap-to-Pay SDK platform
// Unavailable: dispute — no dispute management API; chargebacks are handled by the acquiring bank outside NearPay
// Unavailable: invoice — no invoicing API; platform is limited to in-person POS transactions
// Unavailable: payment-method — no stored payment-method objects; card data is handled transiently via NFC tap at the terminal
// Unavailable: payout — no payout API; settlement is managed by the merchant's acquiring bank, not NearPay
// Unavailable: plan — no subscription billing catalog; NearPay is a POS payment infrastructure product, not a billing gateway
// Unavailable: subscription — no subscription API; platform supports only one-time in-person POS payments

import {
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'

import { buildCredentials } from './auth'
import { NearpayClient } from './client'

import { isPurchase, transformCharge, type RawNearpayTransaction } from './transform/charge'
import { transformRefund, type RawNearpayRefund } from './transform/refund'

/**
 * The endpoints NearPay documents (Accounts, Merchant, POS and Banks API
 * pages at https://docs.nearpay.io/sa/en/api-endpoints/) are merchants,
 * terminals, sessions, transactions, intents and reconciliations. None is a
 * customer or a refund list.
 */
function notSupported(resource: string, reason: string): Error {
  return Object.assign(new Error(`NearPay cannot ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** `GET /transactions` envelope: `{ "transactions": [...], "pages": { "total": 1024, "current": 1 } }`. */
interface TransactionsPage {
  transactions?: RawNearpayTransaction[]
  pages?: { total?: number; current?: number }
}

export class NearpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'nearpay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('NearPay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('NearPay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
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

  private client(credentials: Credentials): NearpayClient {
    return new NearpayClient(credentials)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'list customers',
      'no customers endpoint is documented; the API lists merchants, terminals, sessions, transactions, intents and reconciliations',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'read customers',
      'no customers endpoint is documented; the only customer field is transaction.customer_reference_number',
    )
  }

  /**
   * `GET /transactions` ("In this endpoint comes listing transactions and
   * viewing one transaction full details."). Paging, from
   * https://support.nearpay.io/apis-and-sdk ("How to use Pagination?"):
   * `page` "Defines which page you want to access", `limit` "Defines how
   * many objects you want to list per page", and `pages.total` is the
   * "number of pages". No maximum `limit` is documented, so the caller's
   * limit is sent as-is.
   *
   * The list has no documented type filter, so refund-type transactions
   * (receipt `type` other than "purchase") are dropped from the page. The
   * page can then be short; hasMore still comes from `pages`, so no row of a
   * later page is lost.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const query: Record<string, unknown> = { page: params.page ?? 1 }
    if (params.limit !== undefined) query.limit = params.limit
    const res = await this.client(credentials).get<TransactionsPage>('/transactions', query)
    const total = res.pages?.total
    const current = res.pages?.current
    if (typeof total === 'number' && typeof current === 'number') {
      reportUpstreamPage(params, {
        totalPages: total,
        currentPage: current,
        hasMore: current < total,
      })
    }
    if (!Array.isArray(res.transactions)) {
      throw new Error('NearPay GET /transactions answered without a transactions array')
    }
    return res.transactions.filter(isPurchase).map(transformCharge)
  }

  /** `GET /transactions/{transaction_id}`, answering `{ "transaction": {...} }`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ transaction?: RawNearpayTransaction }>(
      `/transactions/${encodeURIComponent(id)}`,
    )
    if (!res.transaction) throw new Error(`NearPay returned no transaction for ${id}`)
    if (!isPurchase(res.transaction)) {
      throw Object.assign(new Error(`NearPay transaction ${id} is a refund, not a charge`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformCharge(res.transaction)
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'list refunds',
      'no refunds endpoint is documented; a refund is a terminal session ("type" can be either "purchase" or "refund") and shows only as receipts[].is_refunded on a transaction',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawNearpayRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
