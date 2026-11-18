/**
 * Huly authentication — workspace API token (api_key model).
 *
 * Huly issues API tokens under Settings → API Tokens. The in-app docs there
 * (hcengineering/platform plugins/setting-assets/lang/en.json) say:
 *
 *   "Use your API token with the built-in REST API to query and modify
 *    workspace data. Pass the token as a Bearer token in the Authorization
 *    header."
 *   "Your workspace ID (UUID) is included in the token. Pass it as
 *    :workspaceId in the URL."
 *
 * The token is a JWT (huly.core packages/token/src/token.ts:
 * `import { decode, encode } from 'jwt-simple'`) whose payload carries
 * `workspace: WorkspaceUuid`. The REST base URL is per deployment and shown
 * on the same page as "Base URL", so it is collected with the token.
 *
 * Docs: https://docs.huly.io/getting-started/api-tools/
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiToken',
    label: 'API token',
    type: 'password',
    required: true,
    helpText: `Create one in Huly under Settings → API Tokens. See ${TOKEN_HELP_URL}`,
  },
  {
    name: 'apiBaseUrl',
    label: 'REST API base URL',
    type: 'url',
    required: true,
    helpText:
      'The "Base URL" shown in Huly under Settings → API Tokens → Using the REST API. It ends in /api/v1.',
  },
]

/** The `workspace` claim of a Huly API token (a JWT), or undefined. */
export function workspaceFromToken(token: string): string | undefined {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    const ws =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)['workspace']
        : undefined
    return typeof ws === 'string' && ws.length > 0 ? ws : undefined
  } catch {
    return undefined
  }
}

/** Validate the Connect Link form and store the token, base URL and workspace. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const token = (fields['apiToken'] ?? '').trim()
  const apiBaseUrl = (fields['apiBaseUrl'] ?? '').trim().replace(/\/+$/, '')
  if (!token) throw new Error('API token is required.')
  if (!apiBaseUrl) throw new Error('REST API base URL is required.')
  let url: URL
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw new Error('REST API base URL must be a URL, as shown under Settings → API Tokens.')
  }
  if (!/^https?:$/.test(url.protocol) || !url.pathname.endsWith('/api/v1')) {
    throw new Error(
      'REST API base URL must be the http(s) "Base URL" from Settings → API Tokens, ending in /api/v1.',
    )
  }
  const workspaceId = workspaceFromToken(token)
  if (!workspaceId) {
    throw new Error(
      'The API token does not carry a Huly workspace ID; create a token under Settings → API Tokens.',
    )
  }
  return { accessToken: token, extra: { apiBaseUrl, workspaceId } }
}

/**
 * No OAuth redirect — point users at the Huly token documentation.
 */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * Legacy single-value path: stores the raw token only. Such a connection has
 * no base URL, so every read refuses with 501 until it is reconnected
 * through the Connect Link form (exchangeCredentials).
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/**
 * Huly API tokens are not refreshed — return as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
