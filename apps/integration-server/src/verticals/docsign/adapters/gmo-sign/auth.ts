/**
 * GMO Sign auth helpers — Customer ID + Secret Key (no OAuth).
 *
 * GMO Sign authenticates every API call with three values posted in the
 * request body: `cus_id` (Customer ID), `secret_key`, and a short-lived
 * `access_token`. The first two are static credentials issued by GMO Sign
 * support when the API plan is enabled; the access token is minted per
 * request from them (see client.ts). The account-specific API host
 * (`accessUrl`) is issued alongside the credentials.
 *
 * There is no Authorization-Code flow, so the adapter opts into the Connect
 * Link credential-form flow via the shared `customForm` template, capturing
 * the three fields. The secret key lives on `accessToken`; `cus_id` and the
 * API host live on `extra`.
 *
 * Docs: https://learn.microsoft.com/en-us/connectors/gmosign/
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { DEFAULT_ACCESS_URL } from './constants'

/** Normalise a user-supplied host: strip scheme + trailing slash. */
function normaliseAccessUrl(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

export const FORM = customForm({
  fields: [
    {
      name: 'cusId',
      label: 'Customer ID',
      type: 'text',
      placeholder: 'Your GMO Sign Customer ID',
      helpText:
        'Issued by GMO Sign support when the API plan is enabled. Sent as the cus_id request field.',
      required: true,
    },
    {
      name: 'secretKey',
      label: 'Secret Key',
      type: 'password',
      placeholder: 'Your GMO Sign API secret key',
      helpText:
        'Issued by GMO Sign support alongside the Customer ID. Sent as the secret_key request field.',
      required: true,
    },
    {
      name: 'accessUrl',
      label: 'API host',
      type: 'text',
      placeholder: DEFAULT_ACCESS_URL,
      helpText:
        'The account-specific API host (accessUrl) provided by GMO Sign, e.g. secure.gmosign.com. Omit the https:// prefix.',
      required: false,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const cusId = (fields.cusId ?? '').trim()
    const secretKey = (fields.secretKey ?? '').trim()
    if (!cusId) throw new Error('GMO Sign Customer ID is required.')
    if (!secretKey) throw new Error('GMO Sign Secret Key is required.')
    const accessUrl = fields.accessUrl
      ? normaliseAccessUrl(fields.accessUrl)
      : DEFAULT_ACCESS_URL
    return {
      // The secret key is the long-lived credential; the per-request access
      // token is derived from it + cus_id at call time.
      accessToken: secretKey,
      extra: { cusId, accessUrl },
    }
  },
})
