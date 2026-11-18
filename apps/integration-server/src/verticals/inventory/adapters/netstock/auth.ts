/**
 * Netstock auth.
 *
 * The apiKey field below predates the rebuild and is not a documented
 * credential: no Netstock method sends a request any more (see index.ts), so
 * the stored value is never used. It is kept so existing connections still
 * load.
 *
 * The documented auth for the Data Orchestrator API
 * (https://intercom.help/testing-ebdf46/en/articles/12869750-data-orchestrator-rest-api)
 * is "The API employs OAuth 2.0 for authentication, ensuring secure and
 * standardized access control." and "Currently Netstock issues the API
 * required credentials.": a bearer token from a form POST to
 * /application/o/token/, with no browser redirect.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('netstock has no redirect-based OAuth flow; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [{ name: 'apiKey', label: 'API Key', type: 'password', required: true }]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('netstock credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
