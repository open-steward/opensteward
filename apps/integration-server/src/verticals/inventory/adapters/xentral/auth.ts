/**
 * Xentral auth helpers.
 *
 * Xentral's public REST API uses Personal Access Tokens (PATs) as Bearer tokens.
 * There is no OAuth2 authorization-code or client-credentials flow for the V1
 * REST API surface documented in the public OpenAPI spec; PATs are the supported
 * integration credential type. The platform's correct auth_type is therefore
 * `api_key` — the Connect page renders `credentialFields()` only for non-oauth2
 * auth types.
 *
 * Credentials shape:
 *   accessToken  — the PAT value
 *   extra.xentralId — the normalised instance subdomain (e.g. "mycompany" for
 *                     mycompany.xentral.biz)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

const XENTRAL_SUFFIX = '.xentral.biz'
const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Reduce whatever a customer typed for their instance to the bare subdomain:
 * `acme`, `acme.xentral.biz` and `https://acme.xentral.biz/api/v1` all become
 * `acme`. The PAT is sent to this host on every request, so anything outside
 * `*.xentral.biz` (including `acme.xentral.biz.evil.example`) is rejected.
 */
export function normaliseXentralId(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) {
    throw new Error('Xentral instance ID is required (e.g. mycompany for mycompany.xentral.biz).')
  }
  let sub = s
  if (s.includes('.') || s.includes(':')) {
    if (!s.endsWith(XENTRAL_SUFFIX)) {
      throw new Error('Xentral instance must be a *.xentral.biz host.')
    }
    sub = s.slice(0, -XENTRAL_SUFFIX.length)
    if (!sub || sub.includes('.')) {
      throw new Error('Xentral instance must be a *.xentral.biz host.')
    }
  }
  if (!SUBDOMAIN_LABEL.test(sub)) {
    throw new Error('Xentral instance ID may only contain letters, digits and hyphens.')
  }
  return sub
}

export function getAuthUrlUnsupported(): never {
  throw new Error(
    'xentral uses Personal Access Tokens (PATs); use credentialFields() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'xentralId',
      label: 'Xentral instance ID',
      type: 'text',
      required: true,
      placeholder: 'mycompany',
      helpText: 'The subdomain of your Xentral instance — mycompany for mycompany.xentral.biz.',
    },
    {
      name: 'accessToken',
      label: 'Personal Access Token',
      type: 'password',
      required: true,
      helpText: 'Create one in Xentral under Personal Access Tokens for an API user.',
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const xentralId = normaliseXentralId(fields['xentralId'])
  const accessToken = (fields['accessToken'] ?? '').trim()
  if (!accessToken) throw new Error('Xentral personal access token is required.')
  return { accessToken, extra: { xentralId } }
}
