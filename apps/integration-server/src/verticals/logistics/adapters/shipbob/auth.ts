/**
 * Auth for logistics/shipbob.
 *
 * The flow itself lives in `verticals/shared/shipbob-oauth.ts`, shared with
 * `inventory/shipbob-inventory` — same IdentityServer, same app registration,
 * same token endpoint, and the same three ShipBob-specific traps (the
 * `response_type` rewrite, the two independent environments, mandatory PKCE).
 * A vertical cannot import another vertical, so the kernel project holds it.
 *
 * What stays here is this adapter's own half: its default scopes, and that it
 * DOES resolve a channel at exchange, because `ShipBobClient` sends
 * `shipbob_channel_id` and channel-scoped writes and `order:estimate` need it.
 */
import type { Credentials } from '../../adapter/interface'
import {
  buildAuthUrl as buildShipBobAuthUrl,
  exchangeCode as exchangeShipBobCode,
  refreshCredentials as refreshShipBobCredentials,
  authHeader as shipbobAuthHeader,
  type ShipBobOAuthConfig,
} from '../../../shared/shipbob-oauth'
import { DEFAULT_SCOPES } from './constants'

export interface ShipBobAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
  /** Use ShipBob's staging environment. An app lives in production OR staging,
   *  never both, and the wrong one fails with an unexplained error page. */
  sandbox?: boolean
  /** The name ShipBob knows this application by. Defaults to
   *  `DEFAULT_APP_NAME`; see the shared module's `resolveChannel`. */
  appName?: string
}

function shared(config: ShipBobAuthConfig): ShipBobOAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: config.scopes ?? DEFAULT_SCOPES,
    sandbox: config.sandbox,
    appName: config.appName,
    // `ShipBobClient` turns `extra.channelId` into the `shipbob_channel_id`
    // header; without the lookup that header is never sent and channel-scoped
    // writes cannot work.
    resolveChannel: true,
  }
}

/**
 * Build the ShipBob OAuth2 authorization URL.
 */
export function buildAuthUrl(
  config: ShipBobAuthConfig,
  state: string,
  codeChallenge?: string,
): string {
  return buildShipBobAuthUrl(shared(config), state, codeChallenge)
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  config: ShipBobAuthConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<Credentials> {
  return exchangeShipBobCode(shared(config), code, redirectUri, codeVerifier)
}

/**
 * Refresh an expired access token.
 */
export async function refreshCredentials(
  config: ShipBobAuthConfig,
  credentials: Credentials,
): Promise<Credentials> {
  return refreshShipBobCredentials(shared(config), credentials)
}

/**
 * Build the Authorization header value for ShipBob requests.
 * Works for both PAT tokens and OAuth2 access tokens.
 */
export const authHeader = shipbobAuthHeader
