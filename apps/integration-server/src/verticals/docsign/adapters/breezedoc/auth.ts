/**
 * BreezeDoc auth helpers.
 *
 * BreezeDoc authenticates with a Personal Access Token passed as
 * `Authorization: Bearer {TOKEN}`. There is no OAuth authorization-code
 * dance to wire for the connect flow — the customer mints a token at
 * https://breezedoc.com/integrations/api and pastes it into the hosted
 * Connect Link form (see the `simpleApiKey` form attached in index.ts).
 *
 * The `BaseAdapter` contract still requires the three OAuth methods, so we
 * provide degenerate implementations: `buildAuthUrl` deep-links to the
 * token settings page, `exchangeCode` treats the submitted code as the raw
 * token, and `refreshCredentials` is a no-op (Personal Access Tokens do not
 * expire on a fixed schedule).
 *
 * Docs: https://breezedoc.com/developer/docs/
 */

import type { Credentials } from '@opensteward/shared'
import { API_TOKEN_SETTINGS_URL } from './constants'

export function buildAuthUrl(): string {
  // No OAuth redirect flow — point the customer at the token settings page.
  return API_TOKEN_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // `code` is the Personal Access Token pasted by the customer.
  return { accessToken: code.trim() }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Personal Access Tokens do not expire on a fixed schedule; nothing to refresh.
  return credentials
}
