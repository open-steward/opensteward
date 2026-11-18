/**
 * Ordergroove adapter for the ecommerce vertical.
 *
 * Ordergroove is a subscription / relationship-commerce layer that sits on
 * top of an existing storefront — it is not itself a store. This adapter
 * covers the three canonical resources Ordergroove's REST API genuinely
 * exposes for that layer:
 *
 *  - Products  — the merchant's catalog as OG mirrors it (list/get/update;
 *    no single-item create or delete endpoint is documented)
 *  - Customers — subscribers (list/get/create; no update or delete endpoint
 *    is documented for the fields this adapter can populate)
 *  - Orders    — subscription-order events (list/get/cancel)
 *
 * Not supported: variants, collections, locations, inventory, fulfillments,
 * refunds, (payment) transactions, discounts — see `metadata.ts` for the
 * documented reason each is unavailable.
 *
 * Auth: static `x-api-key` issued per merchant in the Ordergroove Admin.
 *
 * Docs (all fetched 2026-09-13):
 *  - https://developer.ordergroove.com/reference/start
 *  - https://developer.ordergroove.com/reference/authentication
 *  - https://developer.ordergroove.com/reference/pagination
 *  - https://developer.ordergroove.com/reference/ordergroove-api-rate-limits
 *  - https://developer.ordergroove.com/reference/products-list
 *  - https://developer.ordergroove.com/reference/products-retrieve
 *  - https://developer.ordergroove.com/reference/products-update
 *  - https://developer.ordergroove.com/reference/customers-list
 *  - https://developer.ordergroove.com/reference/customers-retrieve
 *  - https://developer.ordergroove.com/reference/customers-create
 *  - https://developer.ordergroove.com/reference/orders-list
 *  - https://developer.ordergroove.com/reference/orders-retrieve
 *  - https://developer.ordergroove.com/reference/orders-cancel
 *  - https://developer.ordergroove.com/reference/order-status-codes
 *
 * No `webhook.ts`: Ordergroove documents the `Ordergroove-Signature` header
 * name and its `ts=<ts>,sig=<sig>` structure (including the dual-`sig`
 * shape during a 24h key-rotation window) at
 * https://developer.ordergroove.com/reference/webhooks-overview and
 * https://developer.ordergroove.com/reference/configuring-your-server-for-ordergroove-webhooks,
 * but neither that page nor any other page this adapter's research could
 * reach states the HMAC hash function, the byte encoding, or the exact
 * string that gets signed. Implementing verification would mean guessing
 * those three things, which fails closed in the safe direction but is not
 * "implement verification exactly as documented" — so no signature
 * verifier is implemented here. See the adapter rebuild report for the
 * central webhooks.ts entry this leaves unregistered.
 */

import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as ordergrooveExchangeCode } from './auth'
import { OrdergrooveClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, untransformProduct, type RawOrdergrooveProduct } from './transform/product'
import {
  transformCustomer,
  buildCreateCustomerBody,
  type RawOrdergrooveCustomer,
} from './transform/customer'
import { transformOrder, type RawOrdergrooveOrder } from './transform/order'

const SANDBOX_FIELD_OPTIONS = [
  { value: 'false', label: 'Production' },
  { value: 'true', label: 'Staging' },
] as const

const ORDERGROOVE_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Generated in the Ordergroove Admin under Developers → API Keys, sent as x-api-key.',
    },
    {
      name: 'merchantId',
      label: 'Merchant ID',
      type: 'text',
      required: false,
      helpText:
        'Your Ordergroove merchant id. Only needed to create customer records — list/get/update work without it.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: false,
      options: SANDBOX_FIELD_OPTIONS,
      helpText: 'Ordergroove runs a separate staging environment at staging.restapi.ordergroove.com.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) {
      throw new Error('API key is required.')
    }
    const merchantId = (fields['merchantId'] ?? '').trim()
    const sandbox = fields['environment'] === 'true'
    return {
      accessToken: apiKey,
      extra: {
        ...(merchantId ? { merchantId } : {}),
        ...(sandbox ? { sandbox: true } : {}),
      },
    }
  },
})

export class OrdergrooveAdapter implements EcommerceAdapter {
  readonly platform = 'ordergroove'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE, supportsSandbox: true }

  // Connect Link support
  credentialFields = ORDERGROOVE_FORM.credentialFields
  exchangeCredentials = ORDERGROOVE_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return ordergrooveExchangeCode()
  }

  /** The API key is static and does not expire — no-op refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  //
  // Not implemented — see the file header docblock for why (the signature
  // header's HMAC algorithm/encoding/signed-string are not documented
  // anywhere this adapter's research could reach).

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): OrdergrooveClient {
    return new OrdergrooveClient(credentials)
  }

  /**
   * One caller page of a list endpoint: the caller's 1-based `page` walked
   * along Ordergroove's cursor chain at `page_size = limit` (capped at the
   * documented 100). "When there are more results than the page_size limit,
   * the response includes next and previous attributes, which contain URLs
   * with a cursor parameter for fetching subsequent or previous pages."
   * (https://developer.ordergroove.com/reference/pagination). Cursor mode
   * sends no `count`, so only `hasMore` is reported, from `next`.
   *
   * The walk is keyed per connection — environment, merchant and a
   * fingerprint of the API key — plus every filter sent and the page size.
   */
  private async listPaged<Raw>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    path: string,
    filters: Record<string, unknown> = {},
  ): Promise<Raw[]> {
    const limit = Number(params.limit)
    const pageSize =
      Number.isFinite(limit) && limit >= 1 ? Math.min(Math.floor(limit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const query: Record<string, unknown> = { ...filters, page_size: pageSize }
    const env = credentials.extra?.['sandbox'] === true ? 'staging' : 'production'
    const merchant = (credentials.extra?.['merchantId'] as string | undefined) ?? ''
    const key = cursorPagerKey(
      connectionScope(`ordergroove:${env}:${merchant}`, credentials),
      collection,
      query,
    )
    const client = this.client(credentials)
    const res = await pageByCursor<Raw>(key, params.page, async (next) => {
      const page = await client.listWithCursor<Raw>(path, query, next)
      return { items: page.items, next: page.next }
    })
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listPaged<RawOrdergrooveProduct>(credentials, params, 'products', '/products/')
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawOrdergrooveProduct>(
      `/products/${encodeURIComponent(id)}/`,
    )
    return transformProduct(raw)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).patch<RawOrdergrooveProduct>(
      `/products/${encodeURIComponent(id)}/`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) filters['updated_start'] = params.updatedAfter.toISOString()
    const rows = await this.listPaged<RawOrdergrooveCustomer>(credentials, params, 'customers', '/customers/', filters)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawOrdergrooveCustomer>(
      `/customers/${encodeURIComponent(id)}/`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const merchantId = credentials.extra?.['merchantId'] as string | undefined
    const body = buildCreateCustomerBody(data, { merchantId })
    const raw = await this.client(credentials).post<RawOrdergrooveCustomer>('/customers/create/', body)
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) filters['updated_start'] = params.updatedAfter.toISOString()
    const rows = await this.listPaged<RawOrdergrooveOrder>(credentials, params, 'orders', '/orders/', filters)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawOrdergrooveOrder>(
      `/orders/${encodeURIComponent(id)}/`,
    )
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string, _data?: { reason?: string }): Promise<Order> {
    const raw = await this.client(credentials).patch<RawOrdergrooveOrder>(
      `/orders/${encodeURIComponent(id)}/cancel/`,
    )
    return transformOrder(raw)
  }
}
