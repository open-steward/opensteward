/**
 * Dwolla adapter — payments vertical.
 *
 * Reads customers from Dwolla's HAL API
 * (https://developers.dwolla.com/docs/api-reference/customers/list-and-search-customers).
 *
 * Auth: OAuth 2 client-credentials only (see auth.ts). There is no redirect
 * flow: the Connect Link form collects the application's client id / secret.
 *
 * Charges, refunds and payouts refuse with 501: Dwolla's API reference
 * (https://developers.dwolla.com/llms.txt) and its OpenAPI
 * (https://github.com/Dwolla/dwolla-openapi) have no charge, refund or payout
 * resource. Its money movement is transfers and mass payments, which are not
 * mapped here.
 */

import {
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import {
  DWOLLA_CREDENTIAL_FIELDS,
  exchangeDwollaCredentials,
  refreshDwollaCredentials,
} from './auth'
import { DwollaClient } from './client'
import { CUSTOMERS_PATH, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, customerPath } from './constants'

import { transformCustomer, type RawDwollaCustomer } from './transform/customer'

/** Documented `Customers` response of GET /customers: `_links`, `_embedded.customers`, `total`. */
interface DwollaCustomersPage {
  _embedded?: { customers?: RawDwollaCustomer[] }
  total?: number
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CHARGES =
  'Dwolla cannot list charges: its API has no charge resource (no /charges path in the API reference or OpenAPI); money movement is modelled as transfers.'
const NO_REFUNDS =
  'Dwolla cannot list refunds: its API has no refund resource (no /refunds path in the API reference or OpenAPI); the nearest operation is "Cancel a pending transfer".'
const NO_PAYOUTS =
  'Dwolla cannot list payouts: its API has no payout resource (no /payouts path in the API reference or OpenAPI); disbursements are transfers or mass payments.'

export class DwollaAdapter implements PaymentsAdapter {
  readonly platform = 'dwolla'
  readonly version = '0.2.0'
  /** GET /customers: "Default limit is 25 customers per page, maximum 200." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error(
      'Dwolla implements only the OAuth 2 client-credentials grant; submit the client ID and secret via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Dwolla implements only the OAuth 2 client-credentials grant; call exchangeCredentials instead.',
    )
  }

  credentialFields(): CredentialField[] {
    return DWOLLA_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeDwollaCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshDwollaCredentials(credentials)
  }

  private client(credentials: Credentials): DwollaClient {
    return new DwollaClient(credentials)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /customers pages by `limit` ("How many results to return") and
   * `offset` ("How many results to skip"), and reports `total`. Only those
   * two query parameters are sent.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const asked = Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1)
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<DwollaCustomersPage>(CUSTOMERS_PATH, {
      limit: size,
      offset,
    })
    const rows = res?._embedded?.customers ?? []
    const clamp = size < asked ? { pageSize: size } : {}
    if (typeof res?.total === 'number') {
      reportUpstreamPage(params, {
        ...clamp,
        totalCount: res.total,
        hasMore: offset + rows.length < res.total,
      })
    } else if (size < asked) {
      reportUpstreamPage(params, clamp)
    }
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawDwollaCustomer>(customerPath(id))
    return transformCustomer(raw)
  }

  // ── Charges / refunds / payouts: no such Dwolla resources ────────────────

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(NO_CHARGES)
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(NO_CHARGES.replace('cannot list charges', 'cannot read charges'))
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(NO_REFUNDS)
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(NO_REFUNDS.replace('cannot list refunds', 'cannot read refunds'))
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(NO_PAYOUTS)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(NO_PAYOUTS.replace('cannot list payouts', 'cannot read payouts'))
  }
}
