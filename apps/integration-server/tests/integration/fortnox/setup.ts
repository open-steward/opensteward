/**
 * Live Fortnox sandbox bootstrap. Opt-in: all tests in this folder are
 * skipped unless `apps/integration-server/tests/integration/fortnox/.tokens.json`
 * exists.
 *
 * To enable locally:
 *   1. Set FORTNOX_CLIENT_ID + FORTNOX_CLIENT_SECRET in your shell.
 *   2. Run the OAuth flow against a sandbox company.
 *   3. Drop the resulting tokens into .tokens.json (gitignored):
 *        { "accessToken": "...", "refreshToken": "...", "expiresAt": "...", "scope": "..." }
 *
 * Tokens auto-refresh and the file is rewritten so subsequent runs reuse a
 * fresh access token.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { refreshAccessToken } from '../../../src/verticals/accounting/adapters/fortnox/auth'
import { FortnoxAdapter } from '../../../src/verticals/accounting/adapters/fortnox'
import type { Credentials } from '../../../src/verticals/accounting/adapter/interface'

const TOKENS_PATH = resolve(__dirname, '.tokens.json')

const SCOPES = [
  'companyinformation',
  'bookkeeping',
  'customer',
  'supplier',
  'invoice',
  'supplierinvoice',
  'order',
  'payment',
  'profile',
]

function getEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`${name} is not set`)
  return val
}

/** True when the local token blob exists — gates `describe.skipIf(...)`. */
export const hasFortnoxTokens = existsSync(TOKENS_PATH)

/**
 * Throws inside `beforeAll(...)` so suites using that pattern skip; prefer
 * `describe.skipIf(!hasFortnoxTokens)(...)` at the top of a file.
 */
export function skipUnlessIntegration(): void {
  if (!hasFortnoxTokens) {
    throw new Error('skip: no .tokens.json — see ./setup.ts header for the opt-in flow')
  }
}

export async function getCredentials(): Promise<Credentials> {
  const raw = JSON.parse(readFileSync(TOKENS_PATH, 'utf8')) as {
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    scope?: string
  }
  const creds: Credentials = {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
    scope: raw.scope,
  }
  const exp = creds.expiresAt?.getTime() ?? 0
  if (exp >= Date.now() + 60_000) return creds

  if (!creds.refreshToken) throw new Error('Token expired and no refresh token available')
  const refreshed = await refreshAccessToken(
    creds.refreshToken,
    getEnv('FORTNOX_CLIENT_ID'),
    getEnv('FORTNOX_CLIENT_SECRET'),
  )
  writeFileSync(
    TOKENS_PATH,
    JSON.stringify(
      {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt?.toISOString(),
        scope: refreshed.scope,
      },
      null,
      2,
    ),
  )
  return refreshed
}

export function getAdapter(): FortnoxAdapter {
  return new FortnoxAdapter({
    clientId: getEnv('FORTNOX_CLIENT_ID'),
    clientSecret: getEnv('FORTNOX_CLIENT_SECRET'),
    redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
    scopes: SCOPES,
  })
}
