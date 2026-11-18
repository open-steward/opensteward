/**
 * Dodo Payments uses a static API key (Bearer token), not OAuth. Keys are
 * minted in the dashboard under Developer → API Keys and are scoped to a
 * single environment — a test key only works against test.dodopayments.com,
 * a live key only against live.dodopayments.com.
 *
 * The merchant submits the key plus the environment via the Connect Link
 * form (see `credentialFields` in index.ts). We store the raw key as the
 * access token and the environment on `credentials.extra.mode` so the client
 * can pick the matching base URL.
 *
 * Docs: https://docs.dodopayments.com/api-reference/introduction
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  const mode = (fields.mode ?? 'live').trim() === 'test' ? 'test' : 'live'
  return { accessToken: apiKey, extra: { mode } }
}
