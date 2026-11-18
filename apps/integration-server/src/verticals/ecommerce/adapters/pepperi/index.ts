/**
 * Pepperi adapter for the ecommerce vertical.
 *
 * Pepperi is a B2B sales / order-capture platform (storefront + field-sales
 * app + order capture), not a D2C storefront. It has no OAuth
 * authorization-code flow; instead an admin's email + password is exchanged
 * once for a long-lived company `APIToken` (see `./auth.ts`), which is what
 * this adapter persists — never the admin password.
 *
 * Implemented: Items → products, Accounts → customers, both full CRUD with
 * field names confirmed against Pepperi's own bundled request-body
 * definitions (see `transform/product.ts` / `transform/customer.ts`).
 *
 * NOT implemented, each declared unavailable in `metadata.ts` with a
 * specific, documented reason: variant, collection, location, inventory,
 * order, fulfillment, refund, transaction, discount. Location and inventory
 * were removed because Pepperi's own Inventory/Account Inventory schemas
 * (confirmed via the bundled definitions) carry no location dimension, and
 * canonical InventoryLevel requires one. Order was removed because the
 * confirmed Transactions schema has no `Type` field distinguishing sales
 * orders from quotes/invoices/credit notes — only a per-tenant-configurable
 * `ActivityTypeID` with no documented universal "this means order" value.
 *
 * No `webhook.ts`: Pepperi documents the `X-Pepperi-Signature: sha256=<sig>`
 * header and that it's an HMAC-SHA256 of the raw body using the webhook's
 * configured secret (https://developer.pepperi.com/first-steps/webhooks/),
 * but never states whether `<sig>` is hex or base64 — checked the full page
 * text and the interactive-console bundle
 * (storage.pepperi.com/Developer/developer_body.js, which carries no
 * signature/hmac-related code at all) and found no answer either way.
 * Guessing the encoding would fail closed (safe) but isn't "implement
 * verification exactly as documented," so no verifier is implemented.
 *
 * Docs:
 *  - https://developer.pepperi.com/introduction/
 *  - https://developer.pepperi.com/first-steps/authentication/
 *  - https://developer.pepperi.com/first-steps/retrieving-data/
 *  - https://developer.pepperi.com/api-reference/company-resource/get-company-api-token/
 *  - https://developer.pepperi.com/api-reference/item-resources/post-items/
 *  - https://developer.pepperi.com/api-reference/account-resources/
 *  - https://storage.pepperi.com/Developer/developer_body.js (bundled
 *    request-body schemas backing the interactive console's "Schema" tab —
 *    the source for every field name used in the transforms)
 */

import { customForm, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'

import { buildAuthUrl, fetchApiToken } from './auth'
import { PepperiClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, untransformProduct, type RawPepperiItem } from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawPepperiAccount,
} from './transform/customer'

// ── Connect Link form (admin email + password + consumer key) ──────────────

const PEPPERI_FORM = customForm({
  fields: [
    {
      name: 'adminEmail',
      label: 'Admin email',
      type: 'email',
      required: true,
      helpText: 'Email of a Pepperi user with admin privileges — used once to mint an API token.',
    },
    {
      name: 'adminPassword',
      label: 'Admin password',
      type: 'password',
      required: true,
      helpText: 'Never stored — used only for the one-time GET /company/apitoken exchange.',
    },
    {
      name: 'consumerKey',
      label: 'App Consumer Key',
      type: 'text',
      required: true,
      helpText: "Your app's Consumer Key from the Pepperi developer portal (sent as X-Pepperi-ConsumerKey on every request).",
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const adminEmail = (fields['adminEmail'] ?? '').trim()
    const adminPassword = fields['adminPassword'] ?? ''
    const consumerKey = (fields['consumerKey'] ?? '').trim()
    if (!adminEmail || !adminPassword || !consumerKey) {
      throw new Error('Admin email, admin password, and Consumer Key are all required.')
    }
    const { apiToken, baseUri } = await fetchApiToken(adminEmail, adminPassword)
    return {
      accessToken: apiToken,
      extra: { consumerKey, ...(baseUri ? { baseUri } : {}) },
    }
  },
})

export interface PepperiAdapterConfig {
  /** Deployment-wide fallback Consumer Key, used when a connection's stored
   *  credentials don't carry their own (e.g. one app registration shared
   *  across every connection). Per-connection `extra.consumerKey` wins. */
  consumerKey?: string
}

export class PepperiAdapter implements EcommerceAdapter {
  readonly platform = 'pepperi'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support
  credentialFields = PEPPERI_FORM.credentialFields
  exchangeCredentials = PEPPERI_FORM.exchangeCredentials

  private configConsumerKey: string | undefined

  constructor(config: PepperiAdapterConfig = {}) {
    this.configConsumerKey = config.consumerKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Pepperi does not use OAuth code exchange. Submit the admin email, admin password, ' +
        'and Consumer Key via the Connect Link credential form instead.',
    )
  }

  /** The APIToken is long-lived and does not expire — no-op refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  //
  // Not implemented — see the file header docblock for why (the signature
  // byte encoding, hex vs base64, is not documented anywhere this adapter's
  // research could reach, including Pepperi's own interactive-console
  // bundle).

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): PepperiClient {
    const consumerKey = (credentials.extra?.['consumerKey'] as string | undefined) ?? this.configConsumerKey
    const merged: Credentials = { ...credentials, extra: { ...credentials.extra, consumerKey } }
    return new PepperiClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    return out
  }

  /**
   * `undefined` (not `false`) when the platform sent no count — an unknown
   * total is reported as unknown, never guessed, per `reportUpstreamPage`'s
   * contract in `@opensteward/shared`.
   */
  private hasMore(page: number, pageSize: number, totalRecords?: number): boolean | undefined {
    if (totalRecords == null) return undefined
    return page * pageSize < totalRecords
  }

  // ── Products (Items) ─────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const listParams = this.listParams(params)
    const res = await this.client(credentials).list<RawPepperiItem>('/items', listParams)
    reportUpstreamPage(params, {
      totalCount: res.totalRecords,
      hasMore: this.hasMore(Number(listParams.page), Number(listParams.page_size), res.totalRecords),
    })
    // Records missing the documented ExternalID/Name fields cannot be
    // honestly translated — left out rather than thrown, so one bad record
    // doesn't fail an entire page (see transform/product.ts).
    return res.items.flatMap((raw) => {
      try {
        return [transformProduct(raw)]
      } catch {
        return []
      }
    })
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawPepperiItem>(
      `/items/externalid/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawPepperiItem>('/items', untransformProduct(data))
    return transformProduct(raw)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const body = { ...untransformProduct(data), ExternalID: id }
    const raw = await this.client(credentials).post<RawPepperiItem>('/items', body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/items/externalid/${encodeURIComponent(id)}`)
  }

  // ── Customers (Accounts) ─────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const listParams = this.listParams(params)
    const res = await this.client(credentials).list<RawPepperiAccount>('/accounts', listParams)
    reportUpstreamPage(params, {
      totalCount: res.totalRecords,
      hasMore: this.hasMore(Number(listParams.page), Number(listParams.page_size), res.totalRecords),
    })
    return res.items.flatMap((raw) => {
      try {
        return [transformCustomer(raw)]
      } catch {
        return []
      }
    })
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawPepperiAccount>(
      `/accounts/externalid/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).post<RawPepperiAccount>('/accounts', untransformCustomer(data))
    return transformCustomer(raw)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const body = { ...untransformCustomer(data), ExternalID: id }
    const raw = await this.client(credentials).post<RawPepperiAccount>('/accounts', body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/externalid/${encodeURIComponent(id)}`)
  }
}
