/**
 * Acctivate Inventory Software adapter.
 *
 * Acctivate has no pull API. First-party
 * https://docs.acctivate.com/docs/ConfigurationWebStore.html:
 *
 *   "Acctivate does not provide a "Web Services API". Instead, we leverage the
 *   existing API provided by your shopping cart / eCommerce platform."
 *
 * The Native XML protocol at
 * https://docs.acctivate.com/docs/IntegrationWebStoreNative.html runs the other
 * way: "The Native web store template requires a web developer to implement a
 * web service that uses Acctivate's native XML schema." Acctivate's desktop Web
 * Store Sync calls that web-store-hosted service, and inventory leaves Acctivate
 * only in the UpdateInventory POST it sends there ("Web Store Sync sends
 * inventory qtys for all products in Acctivate."). Nothing documented lets a
 * third party read products or quantities back.
 *
 * The list methods therefore refuse with 501 before sending anything. They used
 * to call QueryConfiguration on the customer's web store, whose documented
 * response is a <Requests> capability list with no <Product> elements, so they
 * always returned an empty list.
 *
 * Resources with no method here (locations, suppliers, purchase orders, stock
 * transfers, stock adjustments) are optional in the interface, and the router
 * answers 501 for them.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'

import {
  credentialFields as acctivateCredentialFields,
  exchangeCredentials as acctivateExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'

export interface AcctivateAdapterConfig {
  /** No OAuth config required; all credentials are user-supplied at runtime. */
  _placeholder?: never
}

const NO_PULL_API =
  '"Acctivate does not provide a "Web Services API". Instead, we leverage the existing API provided by your shopping cart / eCommerce platform." (https://docs.acctivate.com/docs/ConfigurationWebStore.html)'

function notSupported(resource: string): Error {
  return Object.assign(new Error(`Acctivate cannot list ${resource}: ${NO_PULL_API}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class AcctivateAdapter implements InventoryAdapter {
  readonly platform = 'acctivate'
  readonly version = '0.1.0'

  constructor(_config?: AcctivateAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return acctivateCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return acctivateExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'acctivate uses Username + Password + service URL; use credentialFields() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /**
   * Refused: Acctivate only pushes inventory to a web store (UpdateInventory);
   * no documented endpoint returns products to a caller.
   */
  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    throw notSupported('products')
  }

  /**
   * Refused: quantities leave Acctivate only in the UpdateInventory POST it
   * sends to the web store; no documented endpoint returns them to a caller.
   */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw notSupported('stock levels')
  }
}
