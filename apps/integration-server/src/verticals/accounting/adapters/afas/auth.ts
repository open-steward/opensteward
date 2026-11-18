/**
 * AFAS Profit authentication helpers.
 *
 * AFAS uses API-key auth only (no OAuth). Credentials are stored as:
 *   credentials.accessToken  = the raw AFAS API token (the <data> value)
 *   credentials.extra.environmentId = the customer's 5-digit AFAS environment number
 *
 * The Authorization header value is constructed by encoding the API key inside an
 * XML envelope and base64-encoding the whole string:
 *   AfasToken <base64('<token><version>1</version><data>{apiKey}</data></token>')>
 */
import type { Credentials } from '../../adapter/interface'

export function getAuthUrl(_state: string): string {
  // AFAS does not have an OAuth redirect flow — credentials are entered via form.
  return '#'
}

/** Store the raw API token as accessToken and environmentId in extra */
export async function exchangeCode(code: string): Promise<Credentials> {
  // code format: "{environmentId}:{apiKey}"  (colon-separated)
  const colonIdx = code.indexOf(':')
  if (colonIdx !== -1) {
    const environmentId = code.slice(0, colonIdx).trim()
    const apiKey = code.slice(colonIdx + 1).trim()
    return { accessToken: apiKey, extra: { environmentId } }
  }
  // Fallback: treat the whole code as just the API token
  return { accessToken: code }
}

/** AFAS API keys do not expire — return the credentials unchanged */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Build the AfasToken Authorization header value.
 * Encodes `<token><version>1</version><data>{apiKey}</data></token>` as base64.
 */
export function buildAfasAuthHeader(apiKey: string): string {
  const xml = `<token><version>1</version><data>${apiKey}</data></token>`
  const encoded = Buffer.from(xml, 'utf8').toString('base64')
  return `AfasToken ${encoded}`
}
