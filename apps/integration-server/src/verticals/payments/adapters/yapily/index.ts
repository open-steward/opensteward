/**
 * Yapily adapter — payments vertical.
 *
 * Charge and payout reads refuse with 501 NOT_SUPPORTED before sending
 * anything. Yapily is an open-banking payment-initiation API and documents no
 * charges or payouts resource: neither path is in its OpenAPI spec
 * (https://docs.yapily.com/openapi-converted.json, Yapily API 13.0.0), and it
 * documents no way to list payments. Its only payment read is by id,
 * GET /payments/{paymentId}/details ("Returns the details of a payment.",
 * https://docs.yapily.com/api-reference/payments/get-payment-details.md), which
 * also needs a per-user consent token this connection does not carry.
 *
 * Auth (auth.ts) is an authorization_code flow that Yapily does not document:
 * "All API requests require Basic Authentication using your Application ID and
 * Application Secret." (https://docs.yapily.com/api-reference/introduction).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

export interface YapilyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(what: string): Error {
  return Object.assign(
    new Error(
      `Yapily cannot ${what}: Yapily documents no charges or payouts resource and no payments list; ` +
        'its only payment read is "GET /payments/{paymentId}/details" ("Returns the details of a payment."), ' +
        'by id under a per-user consent token',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class YapilyAdapter implements PaymentsAdapter {
  readonly platform = 'yapily'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: YapilyAdapterConfig) {
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
    throw notSupported('list charges')
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported('read charges')
  }

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported('list payouts')
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported('read payouts')
  }
}
