/**
 * Signzy Contract360 auth helpers — static access token only.
 *
 * Signzy authenticates Contract360 requests with a static access token
 * provisioned by your Signzy CSM, sent in the `Authorization` header (no
 * `Bearer` prefix). There is no OAuth Authorization-Code flow, so
 * `getAuthUrl` / `exchangeCode` are unsupported and credentials are collected
 * through the Connect Link form (`credentialFields()` + `exchangeCredentials()`).
 *
 * The token is environment scoped, so the form also captures production vs
 * pre-production; the resolved host is stored on `credentials.extra.baseUrl`
 * for the client to read.
 *
 * Docs: https://docs.signzy.com/contract360/pull-contract-api
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PRODUCTION_HOST, SANDBOX_HOST } from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'Signzy does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Signzy does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static access token — nothing to refresh.
  return credentials
}

export const FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Signzy access token',
      type: 'password',
      placeholder: 'Access token shared by your Signzy CSM',
      helpText:
        'Sent verbatim in the Authorization header on every Contract360 request. Provisioned by your assigned Signzy customer-success manager.',
      required: true,
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      helpText: 'Production and pre-production have separate access tokens and hosts.',
      options: [
        { value: 'production', label: 'Production (api.signzy.app)' },
        { value: 'sandbox', label: 'Pre-production (api-preproduction.signzy.app)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!accessToken) throw new Error('Signzy access token is required.')
    const environment = (fields['environment'] ?? 'production').trim().toLowerCase()
    const baseUrl = environment === 'sandbox' ? SANDBOX_HOST : PRODUCTION_HOST
    return {
      accessToken,
      extra: { environment, baseUrl },
    }
  },
})
