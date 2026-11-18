/**
 * Netstock adapter: predictive inventory planning.
 *
 * Netstock's only documented REST API is the Data Orchestrator
 * (https://intercom.help/testing-ebdf46/en/articles/12869750-data-orchestrator-rest-api,
 * in the "Netstock REST API" collection of Netstock's Intercom help centre):
 *
 *   "Data Orchestrator exposes a REST API to allow customers to push the data IA
 *    requires to IA rather than IA having to pull the data from the customer via
 *    an ERP integration."
 *
 * Item master, stock, location, supplier and purchase-order data can only be
 * sent in (POST /import/*). Its only GET calls are /dataset/status,
 * /dataset/status_legend, /dataset/full_audit_log and /model/status, which
 * report on imports, not on business records. So every read method refuses
 * with 501 before sending anything.
 *
 * The methods used to call GET /items, /stock-on-hand, /warehouses,
 * /suppliers and /purchase-orders (and /{id} under them) on
 * https://api.netstock.com/v1, a host with no DNS record, with an invented
 * cursor/pageSize contract and an X-API-Key header. The documented hosts are
 * orchestrator-{emea,apac,us}-auth-api.netstock.co with an OAuth 2.0 token
 * from POST /application/o/token/.
 *
 * Resources with no method here (stock transfers, stock adjustments) are
 * optional in the interface, and the router answers 501 for them.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as netstockCredentialFields,
  exchangeCredentials as netstockExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'

export type NetstockAdapterConfig = Record<string, never>

const DATA_ORCHESTRATOR_URL =
  'https://intercom.help/testing-ebdf46/en/articles/12869750-data-orchestrator-rest-api'

const PUSH_ONLY =
  `"Data Orchestrator exposes a REST API to allow customers to push the data IA requires to IA ` +
  `rather than IA having to pull the data from the customer via an ERP integration." ` +
  `Its only GET calls are /dataset/status, /dataset/status_legend, /dataset/full_audit_log and ` +
  `/model/status (${DATA_ORCHESTRATOR_URL})`

const OPENAPI_URL = 'https://orchestrator-us-auth-api.netstock.co/swagger/openapi.json'

/** The documented import call for each resource, quoted from the Data Orchestrator page. */
const IMPORT_CALL = {
  // The help page's "Master" section gives "URL: /import/suppliers", a doc typo:
  // the vendor's OpenAPI has a separate operation, `post /import/master`,
  // summarised "Imports master". Cite the OpenAPI so the message is right.
  products: `POST /import/master ("Imports master", ${OPENAPI_URL})`,
  'stock levels':
    '"This call facilitates the data import for stock by locations URL: /import/stock_by_location Method: POST"',
  locations:
    '"This call facilitates the data import for locations URL: /import/locations Method: POST"',
  suppliers:
    '"This call facilitates the data import for suppliers URL: /import/suppliers Method: POST"',
  'purchase orders':
    '"This call facilitates the data import for purchase orders URL: /import/po Method: POST"',
} as const

type Resource = keyof typeof IMPORT_CALL

function cannotList(resource: Resource): Error {
  return Object.assign(
    new Error(
      `Netstock cannot list ${resource}: they can only be pushed in, ${IMPORT_CALL[resource]}. ${PUSH_ONLY}`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

function cannotRead(resource: string): Error {
  return Object.assign(
    new Error(
      `Netstock cannot read a ${resource} by id: the API documents no read call for it. ${PUSH_ONLY}`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class NetstockAdapter implements InventoryAdapter {
  readonly platform = 'netstock'
  readonly version = '0.1.0'

  constructor(_config?: NetstockAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return netstockCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return netstockExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('netstock has no redirect-based OAuth flow; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Products ───────────────────────────────────────────────────────────────

  /** Refused: see the file header. */
  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    throw cannotList('products')
  }

  /** Refused: see the file header. */
  async getProduct(_credentials: Credentials, _id: string): Promise<Product> {
    throw cannotRead('product')
  }

  // ── StockLevels ────────────────────────────────────────────────────────────

  /** Refused: see the file header. */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw cannotList('stock levels')
  }

  /** Refused: see the file header. */
  async getStockLevel(_credentials: Credentials, _id: string): Promise<StockLevel> {
    throw cannotRead('stock level')
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  /** Refused: see the file header. */
  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    throw cannotList('locations')
  }

  /** Refused: see the file header. */
  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    throw cannotRead('location')
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  /** Refused: see the file header. */
  async listSuppliers(_credentials: Credentials, _params: QueryParams): Promise<Supplier[]> {
    throw cannotList('suppliers')
  }

  /** Refused: see the file header. */
  async getSupplier(_credentials: Credentials, _id: string): Promise<Supplier> {
    throw cannotRead('supplier')
  }

  // ── PurchaseOrders ─────────────────────────────────────────────────────────

  /**
   * Refused: see the file header. Recommended orders come out only one at a
   * time through POST /file/pop_po ("This call will “pop” and display the
   * oldest available purchase order."), which consumes the queue and is not a
   * list of purchase orders.
   */
  async listPurchaseOrders(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    throw cannotList('purchase orders')
  }

  /** Refused: see the file header. */
  async getPurchaseOrder(_credentials: Credentials, _id: string): Promise<PurchaseOrder> {
    throw cannotRead('purchase order')
  }
}
