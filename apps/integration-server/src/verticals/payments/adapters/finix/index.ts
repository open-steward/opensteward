/**
 * Finix adapter — payments vertical.
 *
 * Finix is a US payments platform/processor. Its single funds-movement
 * primitive is the `Transfer`; sellers and buyers are `Identity` resources,
 * cards/bank accounts are `Payment Instrument`s, refunds are `REVERSAL`
 * transfers, and chargebacks are `Dispute`s.
 *
 * Canonical mapping:
 *   Customer            ← Identity              (GET /identities, /identities/{id})
 *   Charge              ← Transfer              (GET /transfers, /transfers/{id})
 *   Refund              ← REVERSAL Transfer     (GET /transfers?type=REVERSAL,
 *                                                POST /transfers/{id}/reversals)
 *   PaymentMethod       ← Payment Instrument    (GET /payment_instruments, /{id})
 *   Dispute             ← Dispute               (GET /disputes, /disputes/{id})
 *   Payout              ← Settlement            (GET /settlements, /settlements/{id})
 *   Subscription        ← Subscription          (GET /subscriptions, /subscriptions/{id})
 *   Plan                ← SubscriptionPlan      (GET /subscription_plans, /{id})
 *   BalanceTransaction  ← BalanceEntry          (GET /balance_entries/{id},
 *                                                GET /balances/{id}/balance_entries)
 *
 * Auth: HTTP Basic (API key username + secret), submitted via Connect Link.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice — Finix has no invoice API in its published spec
 *              (early-access feature not yet publicly available as of 2022-02-01)
 *
 * Docs: https://docs.finix.com/api
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { FINIX_CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { FinixClient } from './client'
import { parseFinixWebhookEvents, verifyFinixWebhook } from './webhook'

import { transformCustomer, type RawFinixIdentity } from './transform/customer'
import { transformCharge, type RawFinixTransfer } from './transform/charge'
import { transformRefund, type RawFinixReversal } from './transform/refund'
import { transformPaymentMethod, type RawFinixPaymentInstrument } from './transform/payment-method'
import { transformDispute, type RawFinixDispute } from './transform/dispute'
import { transformPayout, type RawFinixSettlement } from './transform/payout'
import {
  transformBalanceTransaction,
  type RawFinixBalanceEntry,
} from './transform/balance-transaction'
import { transformPlan, type RawFinixSubscriptionPlan } from './transform/plan'
import { transformSubscription, type RawFinixSubscription } from './transform/subscription'

/** The caller's page size, clamped to Finix's documented 100 per page. */
function pageSizes(params: QueryParams): { asked: number; limit: number } {
  const requested = Number(params.limit ?? DEFAULT_PAGE_SIZE)
  const asked =
    Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_PAGE_SIZE
  return { asked, limit: Math.min(asked, MAX_PAGE_SIZE) }
}

/** Filters every list sends, besides the page size and cursor. */
function listFilters(params: QueryParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.updatedAfter instanceof Date) {
    out['updated_at.gte'] = params.updatedAfter.toISOString()
  }
  return out
}

/**
 * The pager scope for one connection: the API key username and host, plus a
 * fingerprint of the key pair (see `connectionScope`).
 */
function finixScope(credentials: Credentials): string {
  const extra = credentials.extra as { live?: boolean; username?: string } | undefined
  const host = extra?.live === true ? 'live' : 'sandbox'
  return connectionScope(`finix:${host}:${extra?.username ?? ''}`, credentials)
}

/** A balance entry walk position: the balances page, a balance on it, and that balance's entries cursor. */
interface BalanceEntryCursor {
  balances?: string
  index: number
  entries?: string
}

export class FinixAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'finix'
  readonly version = '0.1.0'
  /** "All API responses are limited to 100 results per page." (pagination guide) */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Finix uses API-key (HTTP Basic) auth; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Finix uses API-key (HTTP Basic) auth; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FINIX_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFinixWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFinixWebhookEvents(payload)
  }

  private client(credentials: Credentials): FinixClient {
    return new FinixClient(credentials)
  }

  /**
   * One caller page of a Finix list.
   *
   * Every list is an opaque cursor walk: "To get results ***after***
   * `next_cursor`, pass in `after_cursor: {{next_cursor}}`", and "When
   * `next_cursor` is `null`, there are no more results available." Page sizes
   * are "limited to 100 results per page".
   * https://docs.finix.com/additional-resources/developers/authentication-and-api-basics/pagination.md
   *
   * The 1-based `page` is mapped onto that chain by {@link pageByCursor},
   * keyed per connection, collection, filter and size. A caller that passes a
   * raw `after_cursor` gets that one upstream page as-is, outside the pager.
   */
  private async pageList<R, K extends string>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    key: K,
    extra: Record<string, unknown> = {},
  ): Promise<R[]> {
    const { asked, limit } = pageSizes(params)
    const query = { ...listFilters(params), ...extra, limit }
    const client = this.client(credentials)
    const fetchPage = async (
      cursor: string | undefined,
    ): Promise<{ items: R[]; next?: string }> => {
      const res = await client.listPage<R, K>(
        path,
        key,
        cursor === undefined ? query : { ...query, after_cursor: cursor },
      )
      // A next_cursor repeating the one just sent would loop; treat it as the end.
      return { items: res.items, next: res.next !== cursor ? res.next : undefined }
    }

    let items: R[]
    let hasMore: boolean
    if (typeof params.after_cursor === 'string') {
      const res = await fetchPage(params.after_cursor)
      items = res.items
      hasMore = res.next !== undefined
    } else {
      const pagerKey = cursorPagerKey(finixScope(credentials), path, query)
      ;({ items, hasMore } = await pageByCursor<R>(pagerKey, params.page, fetchPage))
    }
    reportUpstreamPage(params, limit < asked ? { hasMore, pageSize: limit } : { hasMore })
    return items
  }

  // ── Customers ← Identities ─────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pageList<RawFinixIdentity, 'identities'>(
      credentials,
      params,
      '/identities',
      'identities',
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawFinixIdentity>(`/identities/${id}`)
    return transformCustomer(res)
  }

  // ── Charges ← Transfers ────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.pageList<RawFinixTransfer, 'transfers'>(
      credentials,
      params,
      '/transfers',
      'transfers',
      { type: 'DEBIT' },
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawFinixTransfer>(`/transfers/${id}`)
    return transformCharge(res)
  }

  // ── Refunds ← REVERSAL Transfers ───────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.pageList<RawFinixReversal, 'transfers'>(
      credentials,
      params,
      '/transfers',
      'transfers',
      { type: 'REVERSAL' },
    )
    return rows.map(transformRefund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId is required to create a Finix refund.')
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) body.refund_amount = data.amount
    const res = await this.client(credentials).post<RawFinixReversal>(
      `/transfers/${data.chargeId}/reversals`,
      body,
    )
    return transformRefund(res)
  }

  // ── Payment methods ← Payment Instruments ──────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const rows = await this.pageList<RawFinixPaymentInstrument, 'payment_instruments'>(
      credentials,
      params,
      '/payment_instruments',
      'payment_instruments',
    )
    return rows.map(transformPaymentMethod)
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawFinixPaymentInstrument>(
      `/payment_instruments/${id}`,
    )
    return transformPaymentMethod(res)
  }

  // ── Disputes ───────────────────────────────────────────────────────────────

  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.pageList<RawFinixDispute, 'disputes'>(
      credentials,
      params,
      '/disputes',
      'disputes',
    )
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawFinixDispute>(`/disputes/${id}`)
    return transformDispute(res)
  }

  // ── Payouts ← Settlements ──────────────────────────────────────────────────

  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.pageList<RawFinixSettlement, 'settlements'>(
      credentials,
      params,
      '/settlements',
      'settlements',
    )
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawFinixSettlement>(`/settlements/${id}`)
    return transformPayout(res)
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.pageList<RawFinixSubscription, 'subscriptions'>(
      credentials,
      params,
      '/subscriptions',
      'subscriptions',
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawFinixSubscription>(`/subscriptions/${id}`)
    return transformSubscription(res)
  }

  // ── Plans ← SubscriptionPlans ──────────────────────────────────────────────

  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const rows = await this.pageList<RawFinixSubscriptionPlan, 'subscription_plans'>(
      credentials,
      params,
      '/subscription_plans',
      'subscription_plans',
    )
    return rows.map(transformPlan)
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const res = await this.client(credentials).get<RawFinixSubscriptionPlan>(
      `/subscription_plans/${id}`,
    )
    return transformPlan(res)
  }

  // ── Balance Transactions ← BalanceEntries ──────────────────────────────────

  /**
   * Finix exposes balance entries via:
   *   GET /balances/{balance_id}/balance_entries   (list, nested under a balance)
   *   GET /balance_entries/{id}                    (single fetch)
   *
   * To list all entries without a balance_id, we walk the application's
   * balances and, for each, its entries. Both chains are cursor-paged like
   * every Finix list (`after_cursor` ← `page.next_cursor`, at most 100 a
   * page), so one caller page is not one upstream page: {@link pageByRows}
   * cuts the caller's rows out of the flattened walk and reports `hasMore`
   * exactly. Each upstream page asks for the full 100, so the walk (and its
   * key) does not depend on the caller's limit.
   */
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    interface RawBalance {
      id?: string
    }
    const client = this.client(credentials)
    const filters = listFilters(params)
    const balancePages = new Map<string, Promise<{ items: RawBalance[]; next?: string }>>()
    const balancesAt = (cursor: string | undefined) => {
      const k = cursor ?? ''
      let hit = balancePages.get(k)
      if (!hit) {
        hit = client.listPage<RawBalance, 'balances'>(
          '/balances',
          'balances',
          cursor === undefined
            ? { limit: MAX_PAGE_SIZE }
            : { limit: MAX_PAGE_SIZE, after_cursor: cursor },
        )
        balancePages.set(k, hit)
        hit.catch(() => balancePages.delete(k))
      }
      return hit
    }
    const pagerKey = cursorPagerKey(finixScope(credentials), '/balances/*/balance_entries', {
      ...filters,
      limit: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawFinixBalanceEntry, BalanceEntryCursor>(
      pagerKey,
      params,
      async (at) => {
        const pos: BalanceEntryCursor = at ?? { index: 0 }
        const balances = await balancesAt(pos.balances)
        const nextBalance = (): BalanceEntryCursor | undefined =>
          pos.index + 1 < balances.items.length
            ? { balances: pos.balances, index: pos.index + 1 }
            : balances.next !== undefined && balances.next !== pos.balances
              ? { balances: balances.next, index: 0 }
              : undefined
        const balance = balances.items[pos.index]
        if (!balance?.id) {
          // An empty balances page, or a balance with no id: nothing to list here.
          return { items: [], next: nextBalance() }
        }
        const res = await client.listPage<RawFinixBalanceEntry, 'balance_entries'>(
          `/balances/${balance.id}/balance_entries`,
          // The spec reuses the listBalances response schema; the actual
          // embedded key at runtime for balance entries is 'balance_entries'.
          'balance_entries',
          {
            ...filters,
            limit: MAX_PAGE_SIZE,
            ...(pos.entries !== undefined ? { after_cursor: pos.entries } : {}),
          },
        )
        const next =
          res.next !== undefined && res.next !== pos.entries
            ? { balances: pos.balances, index: pos.index, entries: res.next }
            : nextBalance()
        return { items: res.items, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawFinixBalanceEntry>(`/balance_entries/${id}`)
    return transformBalanceTransaction(res)
  }
}
