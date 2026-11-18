/**
 * Goodflag Signature (formerly Lex Persona) auth: a static API token.
 *
 * "Chaque appel à l'API REST s'authentifie par un **jeton d'API** (*access
 * token*) placé dans l'en-tête `Authorization` : `Authorization: Bearer
 * act_<id>.<secret>`" (https://docs.goodflag.com/wm/api-reference/authentification.md).
 *
 * The API runs on the customer's own tenant host: every endpoint is documented
 * as `https://workflow-manager/api/…` with the host left as a placeholder, and
 * an invitation link "est de la forme `https://<plateforme>/invite?token=…`"
 * (https://docs.goodflag.com/wm/guides/integration/creer-un-parapheur.md).
 * There is no shared API host, so the form collects the tenant URL and stores
 * it on `credentials.extra.baseUrl`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('lex-persona uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API token (act_<id>.<secret>)', type: 'password', required: true },
    {
      name: 'baseUrl',
      label: 'Workflow Manager URL',
      type: 'url',
      placeholder: 'https://<your tenant host>',
      helpText:
        'The https address of your Goodflag Signature (Lex Persona) tenant; the API is served under /api on it.',
      required: true,
    },
  ]
}

/** The tenant origin, without a trailing slash; throws on anything but an https URL. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('lex-persona baseUrl must be the https URL of your Workflow Manager tenant')
  }
  if (url.protocol !== 'https:') {
    throw new Error('lex-persona baseUrl must be the https URL of your Workflow Manager tenant')
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']?.trim()
  if (!apiKey) throw new Error('lex-persona credentialFields require apiKey')
  const baseUrl = fields['baseUrl']
  if (!baseUrl) throw new Error('lex-persona credentialFields require baseUrl')
  return { accessToken: apiKey, extra: { baseUrl: normalizeBaseUrl(baseUrl) } }
}
