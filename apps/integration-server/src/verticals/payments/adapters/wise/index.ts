/**
 * Wise adapter — payments vertical.
 *
 * Reads payouts from Wise transfers
 * (https://docs.wise.com/api-reference/legacy/standard-transfer/transferlist):
 * GET /v1/transfers, "Get the list of transfers for a given user's profile
 * (defaults to user's personal profile)", scoped by `profile` ("User profile
 * ID. If parameter is omitted, defaults to user's personal profile") and paged
 * by `limit` ("Maximum number of records to be returned in response") and
 * `offset` ("Starting record number"). The response is a bare array of
 * transfers with no total, cursor or has-more flag.
 *
 * The profile is resolved once per connection from GET /v2/profiles
 * (https://docs.wise.com/api-reference/legacy/profile/profilelist), whose 200
 * is an "Array of profile objects. Note that there might be more than one
 * business profile returned in the response." Each profile has `id` ("Unique
 * identifier for the profile.") and `type` ("Type of profile.", PERSONAL or
 * BUSINESS). One business profile is read; none reads the personal profile;
 * several refuse with 501, since which one this connection reads is a choice
 * the connection does not record. `currentState` ("Current status of this
 * profile.", enum HIDDEN / VISIBLE / DEACTIVATED, optional) has no documented
 * meaning beyond its name, so a sole business profile in a state other than
 * VISIBLE refuses too: whether its transfers or the personal profile's are the
 * ones meant is not something the docs settle.
 *
 * Customers, charges and refunds refuse with 501: neither of Wise's published
 * OpenAPI descriptions (Latest 2026Q3 and Legacy, both from
 * https://docs.wise.com/api-reference) has a customer, charge or refund
 * resource.
 */

import {
  connectionScope,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { WiseClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  PROFILES_PATH,
  TRANSFERS_PATH,
  transferPath,
} from './constants'

import { transformPayout, type RawWiseTransfer } from './transform/payout'

export interface WiseAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** The fields of a GET /v2/profiles profile object this adapter reads. */
interface RawWiseProfile {
  id: number
  type: 'PERSONAL' | 'BUSINESS'
  currentState?: 'HIDDEN' | 'VISIBLE' | 'DEACTIVATED'
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CUSTOMERS =
  "Wise cannot list customers: its API has no customer resource (no /customers path in the Latest 2026Q3 or Legacy OpenAPI at https://docs.wise.com/api-reference); profiles are the token user's own and recipient accounts are payees."
const NO_CHARGES =
  'Wise cannot list charges: its API has no charge resource (no /charges path in the Latest 2026Q3 or Legacy OpenAPI at https://docs.wise.com/api-reference); Wise is not a card acquirer.'
const NO_REFUNDS =
  'Wise cannot list refunds: its API has no refund resource (no /refunds path in the Latest 2026Q3 or Legacy OpenAPI at https://docs.wise.com/api-reference); a refund is only the transfer status "funds_refunded".'

export class WiseAdapter implements PaymentsAdapter {
  readonly platform = 'wise'
  readonly version = '0.2.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  /** Resolved profile id per connection (connectionScope), set only on success. */
  private profileIds = new Map<string, number>()

  constructor(config: WiseAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): WiseClient {
    return new WiseClient(credentials)
  }

  // ── Customers / charges / refunds: no such Wise resources ─────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(NO_CUSTOMERS)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(NO_CUSTOMERS.replace('cannot list customers', 'cannot read customers'))
  }

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

  // ── Payouts: Wise transfers ───────────────────────────────────────────────

  /**
   * The profile whose transfers this connection reads, from GET /v2/profiles:
   * the one BUSINESS profile, else the PERSONAL profile. More than one business
   * profile refuses: a business user's transfers would otherwise silently be
   * one arbitrary profile's. Cached per connection once resolved.
   */
  private async profileId(credentials: Credentials, client: WiseClient): Promise<number> {
    const key = connectionScope('wise', credentials)
    const cached = this.profileIds.get(key)
    if (cached !== undefined) return cached

    const profiles = await client.get<RawWiseProfile[]>(PROFILES_PATH)
    if (!Array.isArray(profiles)) {
      throw new Error('Wise GET /v2/profiles did not return the documented array of profiles')
    }
    for (const p of profiles) {
      if (p.type !== 'PERSONAL' && p.type !== 'BUSINESS') {
        throw new Error(
          `Wise GET /v2/profiles returned an undocumented profile type ${String(p.type)}; the documented types are PERSONAL and BUSINESS`,
        )
      }
    }
    const business = profiles.filter((p) => p.type === 'BUSINESS')
    if (business.length > 1) {
      throw notSupported(
        `Wise cannot list payouts: the connected Wise user has ${business.length} business profiles (${business
          .map((p) => p.id)
          .join(
            ', ',
          )}) and GET /v1/transfers reads one profile at a time; which business profile this connection reads is a choice it does not record.`,
      )
    }
    let chosen: RawWiseProfile
    if (business.length === 1) {
      chosen = business[0]!
      if (chosen.currentState !== undefined && chosen.currentState !== 'VISIBLE') {
        throw notSupported(
          `Wise cannot list payouts: the connected Wise user's only business profile (${chosen.id}) has currentState ${chosen.currentState}, which Wise documents only as "Current status of this profile."; whether this connection reads that profile's transfers or the personal profile's is a choice it does not record.`,
        )
      }
    } else {
      const personal = profiles.filter((p) => p.type === 'PERSONAL')
      if (personal.length !== 1) {
        throw new Error(
          `Wise GET /v2/profiles returned no BUSINESS profile and ${personal.length} PERSONAL profiles; expected exactly one to read transfers from`,
        )
      }
      chosen = personal[0]!
    }
    if (typeof chosen.id !== 'number') {
      throw new Error(
        `Wise GET /v2/profiles returned a ${chosen.type} profile without its numeric id`,
      )
    }
    this.profileIds.set(key, chosen.id)
    return chosen.id
  }

  /**
   * GET /v1/transfers with `profile`, `limit` and `offset`. Wise documents no
   * maximum `limit`, so the caller's limit is sent as is. The bare-array
   * response carries no end signal; a page shorter than the limit asked for is
   * the end of that profile's transfers.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const size = Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1)
    const client = this.client(credentials)
    const profile = await this.profileId(credentials, client)
    const rows = await client.get<RawWiseTransfer[]>(TRANSFERS_PATH, {
      profile,
      limit: size,
      offset: pageOffset(params, size),
    })
    if (!Array.isArray(rows)) {
      throw new Error('Wise GET /v1/transfers did not return the documented array of transfers')
    }
    if (rows.length < size) reportUpstreamPage(params, { hasMore: false })
    return rows.map(transformPayout)
  }

  /**
   * GET /v1/transfers/{transferId} — "Get transfer info by ID." Its only
   * documented parameter is the path `transferId`, so no profile is resolved.
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const raw = await this.client(credentials).get<RawWiseTransfer>(transferPath(id))
    return transformPayout(raw)
  }
}
