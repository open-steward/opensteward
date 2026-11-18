/**
 * StepOver webSignatureOffice (Tyr web service) authentication.
 *
 * StepOver does NOT implement OAuth. Access to the Tyr web service is a
 * three-part credential issued by StepOver to the integrating customer:
 *
 *   - `username` / `password` — exchanged for a short-lived session id via
 *     `tyrservice.login(username, password)`.
 *   - `signingKey` — a shared secret. Every request body is SHA-1-hashed
 *     together with this secret and the digest is sent as the `X-SOSIGNATURE`
 *     header.
 *   - `baseUrl` (optional) — overrides the production host, e.g. the public
 *     test instance or a self-hosted deployment.
 *
 * Sessions expire, so the adapter logs in on demand from the stored
 * credentials rather than persisting a token. The Connect Link form therefore
 * collects the three durable fields and stores them on `credentials.extra`
 * (with the username also mirrored to `accessToken` so the record is never
 * empty). The OAuth methods on `BaseAdapter` are unsupported and throw.
 *
 * Docs: https://stepoverinfo.atlassian.net/wiki/spaces/WEBSO/pages (a) Tyr Webservice)
 */

import { customForm } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'

const FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'API username',
    type: 'text',
    required: true,
    helpText: 'The Tyr web-service login issued by StepOver for your webSignatureOffice account.',
  },
  {
    name: 'password',
    label: 'API password',
    type: 'password',
    required: true,
    helpText: 'Password for the Tyr login. Exchanged for a session id via tyrservice.login.',
  },
  {
    name: 'signingKey',
    label: 'Request signing key',
    type: 'password',
    required: true,
    helpText:
      'Shared secret from StepOver. SHA-1-hashed with each request body and sent as the X-SOSIGNATURE header.',
  },
  {
    name: 'baseUrl',
    label: 'Service base URL',
    type: 'url',
    required: false,
    placeholder: 'https://www.websignatureoffice.com/tyrservice',
    helpText:
      'Leave blank for the StepOver cloud. Override for the test instance or a self-hosted webSignatureOffice deployment.',
  },
]

/** Connect Link credential form for the Tyr web service (username + password + signing key). */
export const STEPOVER_CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input) {
    const username = (input?.['username'] ?? '').trim()
    const password = input?.['password'] ?? ''
    const signingKey = (input?.['signingKey'] ?? '').trim()
    const baseUrl = (input?.['baseUrl'] ?? '').trim()
    if (!username) throw new Error('API username is required.')
    if (!password) throw new Error('API password is required.')
    if (!signingKey) throw new Error('Request signing key is required.')
    return {
      accessToken: username,
      extra: {
        username,
        password,
        signingKey,
        ...(baseUrl ? { baseUrl } : {}),
      },
    }
  },
})
