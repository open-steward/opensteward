/**
 * Credential-form templates for the Connect Link flow.
 *
 * Adapters whose `auth_type` is not `oauth2` opt into the link flow by
 * exposing two `BaseAdapter` methods:
 *
 *   credentialFields(): CredentialField[]
 *   exchangeCredentials(fields): Promise<Credentials>
 *
 * 95%+ of those adapters share one of two shapes — a single API key, or
 * `clientId` + `clientSecret` for client-credentials OAuth — so we don't
 * want every adapter author to re-implement the form descriptor and the
 * exchange function. These template helpers return a small object that
 * an adapter can attach as two class fields:
 *
 *   import { simpleApiKey } from '@opensteward/shared'
 *   const FORM = simpleApiKey()
 *
 *   class FooAdapter implements BaseAdapter {
 *     credentialFields = FORM.credentialFields
 *     exchangeCredentials = FORM.exchangeCredentials
 *   }
 *
 * For genuinely-bespoke flows (multi-instance hosts, hybrid auth), the
 * `customForm` helper is a passthrough so retrofits don't fork.
 */
import type { CredentialField } from './base'
import type { Credentials } from '../auth/store'

export interface CredentialFormHelper {
  credentialFields(): CredentialField[]
  exchangeCredentials(fields: Record<string, string>): Promise<Credentials>
}

// ── simpleApiKey ───────────────────────────────────────────────────────────

export interface SimpleApiKeyOptions {
  /** Form field name. Defaults to `apiKey`. */
  fieldName?: string
  /** Label shown above the input. Defaults to `API key`. */
  label?: string
  /** Placeholder text. */
  placeholder?: string
  /** "Where do I find this?" caption under the input. */
  helpText?: string
  /** Required. Defaults to true. */
  required?: boolean
}

export function simpleApiKey(options: SimpleApiKeyOptions = {}): CredentialFormHelper {
  const name = options.fieldName ?? 'apiKey'
  const label = options.label ?? 'API key'
  const required = options.required ?? true
  const fields: CredentialField[] = [
    {
      name,
      label,
      type: 'password',
      placeholder: options.placeholder,
      helpText: options.helpText,
      required,
    },
  ]
  return {
    credentialFields(): CredentialField[] {
      return fields
    },
    async exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
      const value = (input?.[name] ?? '').trim()
      if (required && !value) throw new Error(`${label} is required.`)
      return { accessToken: value }
    },
  }
}

// ── oauth2ClientCredentials ────────────────────────────────────────────────

export interface Oauth2ClientCredentialsOptions {
  /** Token endpoint URL. POSTed with `grant_type=client_credentials`.
   *  Either a fixed string (single-tenant SaaS) OR a function that builds
   *  the URL from the customer-supplied fields (multi-host SaaS where the
   *  token endpoint depends on a `region`, `baseUrl`, or `tenantSlug` the
   *  customer typed into the form). */
  tokenUrl: string | ((input: Record<string, string>) => string)
  /** OAuth scopes joined with space. */
  scopes?: string[]
  /**
   * Extra credential fields to render on the form (e.g. `region`, `projectKey`).
   * Their values are stored on `credentials.extra` and must be re-supplied at
   * refresh time by the adapter.
   */
  additionalFields?: CredentialField[]
  /** Override how `credentials.extra` is built from the submitted fields. */
  buildExtra?: (fields: Record<string, string>) => Record<string, unknown>
  /** Custom fetch (test seam). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

const STANDARD_FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
]

export function oauth2ClientCredentials(
  options: Oauth2ClientCredentialsOptions,
): CredentialFormHelper {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const additional = options.additionalFields ?? []
  const fields: CredentialField[] = [...STANDARD_FIELDS, ...additional]

  return {
    credentialFields(): CredentialField[] {
      return fields
    },
    async exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
      const clientId = (input?.['clientId'] ?? '').trim()
      const clientSecret = input?.['clientSecret'] ?? ''
      if (!clientId || !clientSecret) {
        throw new Error('Client ID and client secret are required.')
      }
      // Validate any required additional fields the adapter declared.
      for (const f of additional) {
        if (f.required && !(input?.[f.name] ?? '').trim()) {
          throw new Error(`${f.label} is required.`)
        }
      }
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      })
      if (options.scopes && options.scopes.length > 0) {
        body.set('scope', options.scopes.join(' '))
      }

      const url =
        typeof options.tokenUrl === 'function' ? options.tokenUrl(input) : options.tokenUrl
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Token endpoint ${url} returned ${res.status}: ${text}`)
      }
      const json = (await res.json()) as TokenResponse
      const expiresAt =
        typeof json.expires_in === 'number'
          ? new Date(Date.now() + json.expires_in * 1000)
          : undefined

      const extra =
        options.buildExtra?.(input) ?? defaultExtra(input, additional, clientId, clientSecret)

      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt,
        scope: json.scope,
        extra,
      }
    },
  }
}

function defaultExtra(
  input: Record<string, string>,
  additional: CredentialField[],
  clientId: string,
  clientSecret: string,
): Record<string, unknown> {
  // Store every additional field by name + the clientId/clientSecret so the
  // adapter's refreshCredentials can re-run the grant without re-prompting.
  const out: Record<string, unknown> = { clientId, clientSecret }
  for (const f of additional) {
    const v = input?.[f.name]
    if (v != null && v !== '') out[f.name] = v
  }
  return out
}

// ── customForm ────────────────────────────────────────────────────────────

export interface CustomFormOptions {
  fields: CredentialField[]
  exchange: (fields: Record<string, string>) => Promise<Credentials>
}

export function customForm(options: CustomFormOptions): CredentialFormHelper {
  return {
    credentialFields(): CredentialField[] {
      return options.fields
    },
    exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
      return options.exchange(input)
    },
  }
}
