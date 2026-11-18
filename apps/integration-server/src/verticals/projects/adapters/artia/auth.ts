/**
 * Artia authentication.
 *
 * Artia uses a two-step client-credentials flow via GraphQL:
 *   1. The user supplies a Client ID and Secret (generated in Organisation
 *      Settings → Integrations → "Gerar chaves para API").
 *   2. At connect time `exchangeCredentials` calls the `authenticationByClient`
 *      GraphQL mutation and stores the resulting Bearer token as `accessToken`.
 *      The clientId, secret, and organizationId are persisted on
 *      `credentials.extra` so `refreshCredentials` can re-mint a new token
 *      (tokens are valid for 1 hour).
 *
 * Every subsequent GraphQL request requires:
 *   Authorization: Bearer <token>
 *   OrganizationId: <organizationId>
 *
 * Docs: https://ajuda.artia.com/pt/articles/12559-api
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { GRAPHQL_URL, TOKEN_HELP_URL } from './constants'

const AUTH_MUTATION = `
  mutation Auth($clientId: String!, $secret: String!) {
    authenticationByClient(clientId: $clientId, secret: $secret) {
      token
    }
  }
`

async function fetchToken(clientId: string, secret: string): Promise<string> {
  const { data } = await axios.post<{
    data?: { authenticationByClient?: { token?: string } }
    errors?: Array<{ message: string }>
  }>(
    GRAPHQL_URL,
    { query: AUTH_MUTATION, variables: { clientId, secret } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 },
  )
  if (data.errors && data.errors.length > 0) {
    throw new Error(`Artia auth error: ${data.errors[0]?.message ?? 'unknown'}`)
  }
  const token = data.data?.authenticationByClient?.token
  if (!token) throw new Error('Artia authenticationByClient returned no token.')
  return token
}

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: `Generate API keys in Organisation Settings → Integrations → "Gerar chaves para API". See ${TOKEN_HELP_URL}`,
    },
    {
      name: 'secret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      helpText: 'The secret shown once at key-generation time.',
    },
    {
      name: 'organizationId',
      label: 'Organization ID',
      type: 'text',
      required: true,
      helpText: 'Numeric ID of your Artia organisation (visible in the dashboard URL).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields['clientId'] ?? '').trim()
    const secret = (fields['secret'] ?? '').trim()
    const organizationId = (fields['organizationId'] ?? '').trim()
    if (!clientId) throw new Error('Client ID is required.')
    if (!secret) throw new Error('Client Secret is required.')
    if (!organizationId) throw new Error('Organization ID is required.')
    const token = await fetchToken(clientId, secret)
    return {
      accessToken: token,
      expiresAt: new Date(Date.now() + 55 * 60 * 1000), // 55 min (token lives 60 min)
      extra: { clientId, secret, organizationId },
    }
  },
})

/** Re-mint a token using the stored clientId + secret. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const secret = String(credentials.extra?.['secret'] ?? '')
  const organizationId = String(credentials.extra?.['organizationId'] ?? '')
  if (!clientId || !secret) return credentials
  const token = await fetchToken(clientId, secret)
  return {
    ...credentials,
    accessToken: token,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000),
    extra: { ...credentials.extra, clientId, secret, organizationId },
  }
}

/** Connect Link has no redirect URL — point users at the key-generation docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}
