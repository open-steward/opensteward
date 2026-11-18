/**
 * Auth for shipbob-inventory: OAuth2, plus the Personal Access Token path it
 * started life with.
 *
 * The flow itself is ShipBob's and is shared with `logistics/shipbob` — see
 * `verticals/shared/shipbob-oauth.ts` for the three things ShipBob does
 * differently from a stock provider and why each one is load-bearing. What
 * this file decides is the part that is this adapter's own: which scopes to
 * ask for, and that no channel is resolved at exchange.
 *
 * `credentialFields`/`exchangeCredentials` stay. `auth_type` in
 * `platforms/metadata.ts` is what the customer-facing Connect Link tile reads,
 * and it now says `oauth2`, but the headless credential route still serves an
 * operator pasting a PAT — and every connection made before OAuth existed is
 * one of those.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  buildAuthUrl as buildShipBobAuthUrl,
  exchangeCode as exchangeShipBobCode,
  refreshCredentials as refreshShipBobCredentials,
  type ShipBobOAuthConfig,
} from '../../../shared/shipbob-oauth'
import { DEFAULT_SCOPES } from './constants'

export interface ShipBobInventoryAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
  sandbox?: boolean
}

/**
 * This adapter's half of the shared config.
 *
 * `resolveChannel` is left off: `ShipBobInventoryClient` deliberately never
 * sends `shipbob_channel_id`, because on a read that header filters the
 * response to the one channel our application created — the defect that cost
 * `logistics/shipbob` every order on a real account.
 */
function shared(config: ShipBobInventoryAuthConfig, scopes?: string[]): ShipBobOAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: scopes ?? config.scopes ?? DEFAULT_SCOPES,
    sandbox: config.sandbox,
  }
}

export function buildAuthUrl(
  config: ShipBobInventoryAuthConfig,
  state: string,
  codeChallenge?: string,
  overrideScopes?: string[],
): string {
  return buildShipBobAuthUrl(shared(config, overrideScopes), state, codeChallenge)
}

export async function exchangeCode(
  config: ShipBobInventoryAuthConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<Credentials> {
  return exchangeShipBobCode(shared(config), code, redirectUri, codeVerifier)
}

export async function refreshCredentials(
  config: ShipBobInventoryAuthConfig,
  credentials: Credentials,
): Promise<Credentials> {
  return refreshShipBobCredentials(shared(config), credentials)
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('shipbob-inventory credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
