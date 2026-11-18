/**
 * SpotOn adapter — payments vertical.
 *
 * Auth: OAuth2 (see auth.ts).
 *
 * Charges and payouts refuse with 501. SpotOn's public API is the Centralized
 * API, where every call has the shape
 * "GET https://api.spoton.com/{service_name}/{api_version}/{endpoint}"
 * (https://developers.spoton.com/central-api/docs/spoton-oauth-integration-guide).
 * The 40 reference pages listed in https://developers.spoton.com/central-api/llms.txt
 * define 36 paths, all under /business/v1, /labor/v1|v2, /loyalty/v1, /menu/v1,
 * /onboarding/v1, /order/v1, /reporting/v1 and /reservation/v1. None is a
 * charge, payout or settlement resource.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

export interface SpotOnAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_CHARGES =
  'its Centralized API (https://developers.spoton.com/central-api/llms.txt) has no charge resource; its only paths are under /business, /labor, /loyalty, /menu, /onboarding, /order, /reporting and /reservation. Payments appear only inside GET /reporting/v1/locations/{location_id}/orders, which requires a location_id ("SpotOn Location ID") that this connection does not carry, and those payments have no currency field.'
const NO_PAYOUTS =
  'its Centralized API (https://developers.spoton.com/central-api/llms.txt) has no payout or settlement resource; its only paths are under /business, /labor, /loyalty, /menu, /onboarding, /order, /reporting and /reservation.'

export class SpotOnAdapter implements PaymentsAdapter {
  readonly platform = 'spoton'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SpotOnAdapterConfig) {
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

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(`SpotOn cannot list charges: ${NO_CHARGES}`)
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(`SpotOn cannot read charges: ${NO_CHARGES}`)
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(`SpotOn cannot list payouts: ${NO_PAYOUTS}`)
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(`SpotOn cannot read payouts: ${NO_PAYOUTS}`)
  }
}
