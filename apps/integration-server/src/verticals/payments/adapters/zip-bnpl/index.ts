/**
 * ZipBnpl adapter — payments vertical.
 *
 * Every read refuses with 501 before any request. listCharges, listPayouts and
 * getPayout: Zip documents no such endpoints. getCharge: the only documented
 * read exists, but this adapter's auth is fabricated (see getCharge).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { DEFAULT_SCOPES } from './constants'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface ZipBnplAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ZipBnplAdapter implements PaymentsAdapter {
  readonly platform = 'zip-bnpl'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZipBnplAdapterConfig) {
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

  /**
   * Zip documents charges as create (`"/charges": { "post": ... }`,
   * https://docs.us.zip.co/reference/charges.md) and retrieve by id only
   * (`"/charges/{chargeId}": { "get": ... }`,
   * https://docs.us.zip.co/reference/chargeschargeid.md). There is no list.
   */
  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Zip cannot list charges: its merchant charges API documents only create (POST /charges) and retrieve by id (GET /charges/{chargeId}); the separate gateway reporting list (/transactions/{merchantId}/v3) needs a merchantId and auth this connection does not hold',
    )
  }

  /**
   * Refused: Zip documents "Global platform:
   * <https://global-api.prod.au.edge.zip.co/merchant>" and "The Zip web API uses
   * a secure API key to identify and authorize the merchant."
   * (https://docs.us.zip.co/reference/overview.md). This adapter called
   * https://api.prod.au.edge.zip.co/v2 with an authorization-code token from
   * zip.co/login/connect, an endpoint Zip does not document. Zip documents
   * OAuth only as Client Credentials for Zip NZ ("There is one OAuth flow
   * currently supported: * Client Credentials", token endpoint
   * https://merchant-auth-nz.zip.co/oauth/token;
   * https://developers.zip.co/v4/reference/authentication-authorization.md),
   * not for this host, so no read it made could be real.
   */
  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Zip cannot read a charge: Zip documents "The Zip web API uses a secure API key to identify and authorize the merchant" on https://global-api.prod.au.edge.zip.co/merchant, and this connection holds an authorization-code token from zip.co/login/connect, an endpoint Zip does not document, for a host (api.prod.au.edge.zip.co/v2) Zip does not document',
    )
  }

  // No Zip API reference (https://docs.us.zip.co/llms.txt,
  // https://developers.zip.co/v2/llms.txt) documents a payouts, settlements or
  // disbursements resource.
  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'Zip cannot list payouts: its API documents no payouts, settlements or disbursements resource',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Zip cannot read payouts: its API documents no payouts, settlements or disbursements resource',
    )
  }
}
