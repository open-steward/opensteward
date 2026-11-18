/**
 * Norce Connect Link form.
 *
 * Norce is OAuth2 client-credentials only (no browser redirect), so the
 * Connect page collects every field the client needs directly:
 *
 *   - clientName / region / environment build the tenant's own host
 *     (`{clientName}.api-{region}.{environment}.norce.tech`, `environment`
 *     omitted for `prod`) — the SAME host serves both the token endpoint and
 *     the Commerce Query API, so the connection is confined to `*.norce.tech`
 *     by construction: `clientName` and `region` are validated as bare DNS
 *     labels and never accepted as a pasted URL, so there is no host string
 *     to spoof.
 *   - clientId / clientSecret are the OAuth2 client-credentials pair minted
 *     in Norce Admin.
 *   - applicationId is the numeric `ApplicationId` header every data call
 *     needs alongside the bearer token.
 *
 * `exchangeCredentials` mints an initial token immediately (mirroring
 * `oauth2ClientCredentials`) so a newly-created connection is usable without
 * a separate refresh round-trip, and stashes every field `refreshCredentials`
 * needs to mint the next one in `credentials.extra`.
 *
 * Docs: https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ENVIRONMENTS } from './constants'
import { buildHost, fetchToken } from './auth'

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'clientName',
      label: 'Client name',
      type: 'text',
      required: true,
      placeholder: 'acme',
      helpText: 'The tenant identifier in your Norce host, e.g. "acme" for acme.api-se.norce.tech.',
    },
    {
      name: 'region',
      label: 'Region',
      type: 'text',
      required: true,
      placeholder: 'se',
      helpText: 'The region segment of your Norce host, e.g. "se" for Sweden. Check your Norce onboarding email if unsure.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: ENVIRONMENTS.map((e) => ({ value: e, label: e })),
      helpText: 'Selects which Norce environment to call — also sent as the OAuth2 `scope`.',
    },
    {
      name: 'clientId',
      label: 'OAuth2 client ID',
      type: 'text',
      required: true,
      helpText: 'From Norce Admin → API users (client-credentials grant).',
    },
    {
      name: 'clientSecret',
      label: 'OAuth2 client secret',
      type: 'password',
      required: true,
      helpText: 'Shown once when the API user is created in Norce Admin.',
    },
    {
      name: 'applicationId',
      label: 'Application ID',
      type: 'text',
      required: true,
      placeholder: '1000',
      helpText: 'Numeric Application ID sent as the `ApplicationId` header on every data call.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const clientName = (fields['clientName'] ?? '').trim()
    const region = (fields['region'] ?? '').trim()
    const environment = (fields['environment'] ?? '').trim().toLowerCase()
    const clientId = (fields['clientId'] ?? '').trim()
    const clientSecret = (fields['clientSecret'] ?? '').trim()
    const applicationIdRaw = (fields['applicationId'] ?? '').trim()

    if (!clientName) throw new Error('Client name is required.')
    if (!DNS_LABEL.test(clientName)) {
      throw new Error('Client name must contain only letters, digits, and hyphens.')
    }
    if (!region) throw new Error('Region is required.')
    if (!DNS_LABEL.test(region)) {
      throw new Error('Region must contain only letters, digits, and hyphens.')
    }
    if (!ENVIRONMENTS.includes(environment as (typeof ENVIRONMENTS)[number])) {
      throw new Error(`Environment must be one of: ${ENVIRONMENTS.join(', ')}.`)
    }
    if (!clientId) throw new Error('OAuth2 client ID is required.')
    if (!clientSecret) throw new Error('OAuth2 client secret is required.')
    if (!applicationIdRaw) throw new Error('Application ID is required.')
    if (!/^\d+$/.test(applicationIdRaw)) {
      throw new Error('Application ID must be numeric.')
    }

    const host = buildHost(clientName, region, environment)
    const { accessToken, expiresAt } = await fetchToken(host, clientId, clientSecret, environment)

    return {
      accessToken,
      expiresAt,
      extra: {
        host,
        clientName,
        region,
        environment,
        clientId,
        clientSecret,
        applicationId: applicationIdRaw,
      },
    }
  },
})
