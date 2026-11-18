/**
 * Contracting.Works auth helpers.
 *
 * ContractWorks does not support a standard OAuth2 authorization-code flow.
 * Authentication is a bearer token issued through the Contracting.Works
 * administration UI, scoped to a specific tenant (clientId).
 *
 * Credentials are collected via the Connect Link form (see index.ts for the
 * form descriptor). The functions below are stubs that satisfy the BaseAdapter
 * interface for adapters without OAuth2; they are never called at runtime for
 * this platform.
 */
import type { Credentials } from '@opensteward/shared'

/** Not used — ContractWorks has no OAuth2 authorization-code flow. */
export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  _state: string,
): string {
  return ''
}

/** Not used — credentials are collected via the Connect Link form. */
export async function exchangeCode(
  _code: string,
  _redirectUri: string,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  throw new Error('ContractWorks does not support OAuth2 authorization-code flow.')
}

/**
 * ContractWorks bearer tokens do not expire on a predictable schedule and
 * there is no refresh endpoint. Return existing credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
