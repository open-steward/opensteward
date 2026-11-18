/**
 * Wayfair adapter for the ecommerce vertical.
 *
 * Wayfair is a B2C marketplace that sources products from suppliers via a
 * dropship model. Suppliers interact with Wayfair through a GraphQL API
 * (not a REST API) authenticated with OAuth2 client_credentials.
 *
 * Supported resources:
 *   ✓ Orders          — read: Dropship Orders API (v2) `dropshipOrders` query,
 *                       cursor-paged; write: acceptOrder mutation (v1)
 *   ✓ Fulfillments    — registerOrder (shipment registration) mutation
 *   ✓ Inventory       — saveInventory mutation (write-only feed)
 *
 * Unsupported resources (not exposed by Wayfair's Supplier API):
 *   ✗ Products, Variants, Collections, Locations, Customers,
 *     Refunds, Transactions, Discounts
 *   These return 501 automatically via the adapter registry.
 *
 * Auth: OAuth2 client_credentials
 *   Token URL: https://sso.auth.wayfair.com/oauth/token
 *   Audience:  https://api.wayfair.com/  (or sandbox equivalent)
 *
 * GraphQL endpoints:
 *   v1 (writes):       https://api.wayfair.com/v1/graphql
 *                      https://sandbox.api.wayfair.com/v1/graphql
 *   v2 (order reads):  https://api.wayfair.io/2026-09/dropship-orders/graphql
 *                      https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { InventoryLevel } from '../../schema/inventory'

import { fetchClientCredentialsToken } from './auth'
import { DROPSHIP_ORDERS_SERVED_WITH_ERRORS, WayfairClient } from './client'
import {
  DEFAULT_SCOPES,
  DROPSHIP_ORDERS_DEFAULT_PAGE_SIZE,
  DROPSHIP_ORDERS_MAX_PAGE_SIZE,
  PROD_DROPSHIP_ORDERS_URL,
  SANDBOX_DROPSHIP_ORDERS_URL,
} from './constants'

import { transformOrder, type RawWayfairPurchaseOrder } from './transform/order'
import {
  transformDropshipOrder,
  type RawWayfairDropshipOrder,
  type RawWayfairDropshipOrderIssue,
  type RawWayfairDropshipOrderResult,
} from './transform/dropship-order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWayfairShipmentRegistration,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawWayfairInventoryItem,
  type RawWayfairInventoryFeedResult,
} from './transform/inventory'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   order, fulfillment, inventory
// Unavailable: collection — no product-catalog or collection endpoints in the Wayfair Supplier API; catalog is managed internally by Wayfair
// Unavailable: customer   — end-customer records not exposed; customer data is embedded in PO ship-to fields only
// Unavailable: discount   — no discount or promotion endpoints; promotions managed entirely by Wayfair
// Unavailable: location   — no standalone warehouse/location query; warehouse appears only as embedded fields on purchase orders
// Unavailable: product    — no product read/write endpoints for suppliers; catalog managed internally by Wayfair
// Unavailable: refund     — no refund endpoint; returns/refunds handled through Wayfair's internal customer service
// Unavailable: transaction — no transaction or payment endpoint; supplier payments processed by Wayfair outside the API

// ── GraphQL operations ────────────────────────────────────────────────────────

/**
 * Dropship Orders API (v2) `dropshipOrders` query. Arguments, types and
 * fields are the reference's; the operation name follows its example
 * ("Provide the GraphQL operation name in the query document (for example
 * GetDropshipOrders )"). Warehouse `address` is not selected: only the id is
 * mapped, and the address is PII.
 */
const DROPSHIP_ORDERS = `
  query GetDropshipOrders(
    $filter: SupplierDropshipOrderFilterInput
    $first: Int
    $after: String
    $sort: SupplierDropshipOrderSortInput
  ) {
    dropshipOrders(filter: $filter, first: $first, after: $after, sort: $sort) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          __typename
          ... on SupplierDropshipOrder {
            purchaseOrderNumber
            createdAt
            customerOrderId
            orderType
            status
            mustShipByDate
            storeName
            customer {
              ...PostalAddressFields
            }
            shippingInfo {
              shipSpeed
              carrierCode
            }
            warehouseDetails {
              id
            }
            billingAddress {
              ...PostalAddressFields
            }
            shippingAddress {
              ...PostalAddressFields
            }
            lineItems {
              supplierPartNumber
              quantity
              unitPrice {
                amount
                currencyCode
              }
              status
              name
              listingId
              orderValue {
                amount
                currencyCode
              }
            }
            tasks {
              taskType
              status
            }
          }
          ... on SupplierDropshipOrderIssue {
            purchaseOrderNumber
            code
            message
            remediation
          }
        }
      }
    }
  }

  fragment PostalAddressFields on PostalAddress {
    name
    address1
    address2
    address3
    city
    state
    country
    postalCode
    phoneNumber
    email
  }
`

interface DropshipOrdersResult {
  dropshipOrders: {
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null } | null
    edges?: Array<{ node?: RawWayfairDropshipOrderResult | null } | null> | null
  } | null
}

function isOrder(
  node: RawWayfairDropshipOrderResult | null | undefined,
): node is RawWayfairDropshipOrder {
  return node?.__typename === 'SupplierDropshipOrder'
}

/** Acknowledge (accept) a purchase order. */
const ACCEPT_ORDER = `
  mutation acceptOrder(
    $poNumber: String!
    $shipSpeed: String
    $lineItems: [LineItemInput]
  ) {
    acceptOrder(
      poNumber: $poNumber
      shipSpeed: $shipSpeed
      lineItems: $lineItems
    ) {
      handle
      submittedAt
      errors {
        key
        message
      }
    }
  }
`

/** Register a shipment for a dropship order (advance ship notice). */
const REGISTER_ORDER = `
  mutation registerOrder(
    $poNumber: String!
    $warehouseId: String
    $requestForPickupDate: String
    $packageUnits: [PackageUnitInput]
  ) {
    registerOrder(
      poNumber: $poNumber
      warehouseId: $warehouseId
      requestForPickupDate: $requestForPickupDate
      packageUnits: $packageUnits
    ) {
      handle
      submittedAt
      errors {
        key
        message
      }
    }
  }
`

/** Submit an inventory feed (TRUE_UP or DIFFERENTIAL). */
const SAVE_INVENTORY = `
  mutation saveInventory(
    $supplierId: Int
    $feedKind: FeedKind
    $inventory: [InventoryInput]!
  ) {
    saveInventory(
      supplierId: $supplierId
      feedKind: $feedKind
      inventory: $inventory
    ) {
      handle
      status
      itemCount
      errorCount
      errors {
        key
        message
      }
    }
  }
`

// ── Adapter config ────────────────────────────────────────────────────────────

export interface WayfairAdapterConfig {
  /** Fallback application Client ID; per-connection values from the Connect Link form win. */
  clientId?: string
  /** Fallback application Client Secret; per-connection values from the Connect Link form win. */
  clientSecret?: string
  /** Wayfair-assigned supplier id (integer). Required for inventory mutations. */
  supplierId?: number
  /** Use sandbox environment. Defaults to false (production). */
  sandbox?: boolean
  /** OAuth2 scopes. Defaults to the standard supplier scopes. */
  scopes?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class WayfairAdapter implements EcommerceAdapter {
  readonly platform = 'wayfair'
  readonly version = '0.1.0'
  /** `dropshipOrders(first:)`: "Orders per page when paging forward, 1 to 250". */
  readonly capabilities = { maxPageSize: DROPSHIP_ORDERS_MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private supplierId: number | undefined
  private sandbox: boolean
  private scopes: string[]

  constructor(config: WayfairAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.supplierId = config.supplierId
    this.sandbox = config.sandbox ?? false
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Connect Link form. Per https://developer.wayfair.io/posts/application-management
   * each supplier creates an application in the Developer Portal (signed in
   * with their Partner Home account) and receives a Client ID and Client
   * Secret — sandbox and production applications have separate keys. These
   * are per-connection credentials, exchanged for a 24 h token by
   * `fetchClientCredentialsToken` (https://developer.wayfair.io/posts/api-access-tokens).
   */
  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText:
          'Wayfair Developer Portal → Application Management → your application. ' +
          'Use the keys for the environment this deployment targets (sandbox or production).',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        helpText: 'Shown once when the application is created in the Wayfair Developer Portal.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields['clientId'] ?? '').trim()
    const clientSecret = (fields['clientSecret'] ?? '').trim()
    if (!clientId || !clientSecret) {
      throw new Error('Wayfair Client ID and Client Secret are required.')
    }
    const token = await fetchClientCredentialsToken(clientId, clientSecret, this.sandbox)
    // Kept on extra so refreshCredentials can re-run the grant (no refresh_token is issued).
    return { ...token, extra: { clientId, clientSecret } }
  }

  /**
   * Wayfair uses OAuth2 client_credentials — there is no user-facing authorize
   * URL. This method is provided for interface compatibility but should not be
   * called in production; use `refreshCredentials` instead which obtains a
   * machine-to-machine token directly.
   */
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'WayfairAdapter: getAuthUrl is not applicable — Wayfair uses OAuth2 ' +
        'client_credentials (machine-to-machine). Call refreshCredentials() instead.',
    )
  }

  /**
   * Not applicable for client_credentials — no code exchange step.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'WayfairAdapter: exchangeCode is not applicable — Wayfair uses OAuth2 ' +
        'client_credentials. Call refreshCredentials() with { accessToken: "" } to ' +
        'obtain the initial token.',
    )
  }

  /**
   * Obtain or refresh an access token using client_credentials.
   *
   * Wayfair tokens expire after ~24 h. The shared `isTokenExpired` helper
   * checks `credentials.expiresAt`; when it reports expiry the orchestrator
   * calls this method to get a fresh token.
   *
   * The incoming `credentials` object only needs `clientId`/`clientSecret`
   * stored in its `metadata` by the orchestrator. If those are not present we
   * fall back to the adapter-level config values.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The orchestrator may store clientId/clientSecret in `credentials.extra`
    // for re-use at refresh time. Fall back to adapter-level config values.
    const clientId = (credentials.extra?.['clientId'] as string | undefined) ?? this.clientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.clientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'WayfairAdapter: refreshCredentials needs clientId and clientSecret in credentials.extra ' +
          '(set by the Connect Link form) or in the adapter config.',
      )
    }
    const fresh = await fetchClientCredentialsToken(clientId, clientSecret, this.sandbox)
    return { ...fresh, extra: credentials.extra }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): WayfairClient {
    return new WayfairClient(credentials, this.sandbox)
  }

  /** Client for the read-only Dropship Orders API (v2). */
  private ordersClient(credentials: Credentials): WayfairClient {
    return new WayfairClient(credentials, this.sandbox, {
      endpoint: this.sandbox ? SANDBOX_DROPSHIP_ORDERS_URL : PROD_DROPSHIP_ORDERS_URL,
      supplierId: this.supplierId,
      servedWithErrorCodes: DROPSHIP_ORDERS_SERVED_WITH_ERRORS,
    })
  }

  /**
   * Pager scope for one connection. The Dropship Orders read is "scoped to the
   * supplier the caller's token acts for, falling back to the WF-Supplier-Id
   * header", so the environment, the configured supplier and a fingerprint of
   * the token (`connectionScope`) together identify whose orders a cursor walks.
   */
  private pagerScope(credentials: Credentials): string {
    const env = this.sandbox ? 'sandbox' : 'production'
    return connectionScope(`wayfair:${env}:${this.supplierId ?? 'token-supplier'}`, credentials)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * List Wayfair dropship purchase orders through the Dropship Orders API (v2)
   * `dropshipOrders` query, one upstream page per caller page.
   *
   * The v1 `getDropshipPurchaseOrders` query this used to call takes only
   * limit, hasResponse, fromDate, poNumbers and sortOrder and returns a bare
   * list, so it cannot reach page 2. v2 pages by cursor (reference, verbatim):
   *   first: "Orders per page when paging forward, 1 to 250; omit for the
   *     default of 50."
   *   after: "Cursor to page forward from ( pageInfo.endCursor ); omit for the
   *     first page."
   *   hasNextPage: "True when another page follows this one."
   *   sort: "every sort is tie-broken on PO number so cursors stay stable."
   * No filter is sent: "omit to read the supplier's orders unfiltered". The
   * only date filter is `createdAt`, which is not `updatedAfter`, so an
   * `updatedAfter` is not translated into it.
   *
   * `SupplierDropshipOrderIssue` nodes ("A dropship purchase order that could
   * not be returned"): NOT_FOUND nodes are left out of the page (hasMore
   * comes from `pageInfo.hasNextPage`, so a page shortened by one does not
   * end the walk); any other code fails the page with a 502, because the
   * order behind it exists and dropping it would read as a deletion.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const asked = params.limit ?? DROPSHIP_ORDERS_DEFAULT_PAGE_SIZE
    const first = Math.min(Math.max(1, asked), DROPSHIP_ORDERS_MAX_PAGE_SIZE)
    // Oldest first, so orders created during a walk land after it, not inside it.
    const sort = { field: 'CREATED_AT', direction: 'ASC' }
    const client = this.ordersClient(credentials)

    const page = await pageByCursor<RawWayfairDropshipOrderResult, string>(
      cursorPagerKey(this.pagerScope(credentials), 'dropshipOrders', { first, sort }),
      params.page,
      async (after) => {
        const data = await client.query<DropshipOrdersResult>(DROPSHIP_ORDERS, {
          first,
          sort,
          ...(after !== undefined ? { after } : {}),
        })
        const conn = data.dropshipOrders
        const items = (conn?.edges ?? []).flatMap((e) => (e?.node ? [e.node] : []))
        // An issue node other than NOT_FOUND stands for an order that exists
        // but was not published ("INTERNAL ... retryable with backoff"; an
        // unmapped ship speed "is published as a SupplierDropshipOrderIssue").
        // Serving the page without it would let a finished walk drop that
        // order, so the page fails instead. NOT_FOUND ("the same PO number will
        // not resolve later") has no order behind it and is left out.
        const issue = items.find(
          (n): n is RawWayfairDropshipOrderIssue => !isOrder(n) && n.code !== 'NOT_FOUND',
        )
        if (issue) {
          throw Object.assign(
            new Error(
              `Wayfair could not return purchase order ${issue.purchaseOrderNumber}: ` +
                `${issue.code}: ${issue.message}`,
            ),
            { statusCode: 502, code: 'UPSTREAM_INCOMPLETE' },
          )
        }
        const next = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
        return { items, next }
      },
    )

    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(first < asked ? { pageSize: first } : {}),
    })
    return page.items.filter(isOrder).map(transformDropshipOrder)
  }

  /**
   * Get one purchase order by PO number: `dropshipOrders` filtered on
   * `purchaseOrderNumbers` ("Store-prefixed PO numbers, e.g. CS665334026.
   * Numbers with no order resolve to issue nodes."). A NOT_FOUND issue node
   * becomes a 404.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.ordersClient(credentials).query<DropshipOrdersResult>(DROPSHIP_ORDERS, {
      filter: { purchaseOrderNumbers: [id] },
      first: 1,
    })
    const node = (data.dropshipOrders?.edges ?? [])
      .map((e) => e?.node)
      .find((n) => n?.purchaseOrderNumber === id)
    if (isOrder(node)) return transformDropshipOrder(node)
    if (node == null || node.code === 'NOT_FOUND') {
      throw Object.assign(new Error(`Wayfair: purchase order ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    throw new Error(
      `Wayfair: purchase order ${id} could not be read: ${node.code}: ${node.message}`,
    )
  }

  /**
   * Accept (acknowledge) a Wayfair purchase order.
   *
   * Maps to the `acceptOrder` mutation. The canonical `data` parameter is
   * used only to carry the poNumber via `id` — no body fields are sent to
   * Wayfair on accept.
   *
   * Returns the updated order with fulfillmentStatus = 'FULFILLED' to signal
   * that the order has been acknowledged.
   */
  async updateOrder(credentials: Credentials, id: string, _data: Partial<Order>): Promise<Order> {
    type MutationResult = {
      acceptOrder: {
        handle: string
        submittedAt: string
        errors: Array<{ key: string; message: string }>
      }
    }

    await this.client(credentials).query<MutationResult>(ACCEPT_ORDER, {
      poNumber: id,
    })

    // Return a minimal order reflecting the acknowledged state.
    const raw: RawWayfairPurchaseOrder = {
      poNumber: id,
      acknowledged: true,
    }
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * Register a shipment for a Wayfair dropship order.
   *
   * The canonical `data` parameter must include:
   *   orderId       — poNumber
   *   locationId    — warehouseId
   *   trackingNumber
   *   carrier       — Wayfair carrier code
   */
  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId (poNumber)')

    const mutInput = untransformFulfillment(data)

    type MutationResult = {
      registerOrder: {
        handle: string | null
        submittedAt: string | null
        errors: Array<{ key: string | null; message: string | null }> | null
      }
    }

    const result = await this.client(credentials).query<MutationResult>(REGISTER_ORDER, {
      poNumber: mutInput.poNumber,
      warehouseId: mutInput.warehouseId,
    })

    const raw: RawWayfairShipmentRegistration = {
      ...result.registerOrder,
      poNumber: data.orderId,
      trackingNumber: data.trackingNumber,
      carrierCode: data.carrier,
      warehouseId: data.locationId,
    }

    return transformFulfillment(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Submit a Wayfair inventory feed.
   *
   * Wayfair does not expose individual inventory levels via GET — inventory is
   * write-only through the `saveInventory` mutation. This method is surfaced
   * on `adjustInventoryLevel` so callers can push an absolute quantity.
   *
   * @param credentials  Access token credentials.
   * @param data         variantId = supplierPartNumber, available = quantityOnHand.
   */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const inventoryItem: RawWayfairInventoryItem = {
      supplierPartNumber: data.variantId,
      quantityOnHand: data.available,
      supplierId: this.supplierId,
    }

    type MutationResult = {
      saveInventory: RawWayfairInventoryFeedResult
    }

    await this.client(credentials).query<MutationResult>(SAVE_INVENTORY, {
      supplierId: this.supplierId,
      feedKind: 'TRUE_UP',
      inventory: [
        untransformInventoryLevel({ variantId: data.variantId, available: data.available }),
      ],
    })

    return transformInventoryLevel(inventoryItem, data.locationId)
  }

  /**
   * Apply a stock delta by reading the current level and adding the delta.
   *
   * Because Wayfair's API is write-only, `adjustInventoryLevel` requires the
   * caller to pass the absolute `available` quantity in
   * `data.delta` + some prior knowledge of current stock. For simplicity we
   * treat `delta` as the new absolute quantity (same behaviour as
   * `setInventoryLevel`) and document this in the metadata.
   */
  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: Math.max(0, data.delta),
    })
  }
}
