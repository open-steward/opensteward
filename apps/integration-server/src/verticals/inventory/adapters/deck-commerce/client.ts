/**
 * Deck Commerce HTTP client.
 *
 * Authentication per request:
 *   Authorization: UPPERCASE( HEX( sha256( lowercase(apiName) + timestampUTC + siteApiKey ) ) )
 *   apiVersion: 5
 *
 * POST body always includes:
 *   VerificationKey, TimestampUTC, SiteCode
 *
 * Deck Commerce publishes no API reference; this follows its own published
 * client, the Magento module (github.com/DeckCommerce/magento):
 *   - the URL is the tenant's "Web API Url" joined with the lower-cased API
 *     name (Helper/Data.php getFullWebApiUrl:
 *     `implode('/', [$this->getWebApiUrl($scopeType), strtolower($apiName)])`);
 *   - the token signs that same lower-cased API name (Helper/Data.php getApiToken:
 *     `$key = strtolower($apiName) . $currentTimestamp . $this->getSiteApiKey($scopeType);`);
 *   - the timestamp is `gmdate('n/j/Y H:i A')` (Model/Service/HttpClient.php).
 */
import axios, { type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { normaliseDeckApiBaseUrl } from './auth'
import { API_VERSION } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export function buildToken(apiName: string, timestampUtc: string, siteApiKey: string): string {
  const raw = apiName.toLowerCase() + timestampUtc + siteApiKey
  return createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase()
}

/**
 * The UTC timestamp exactly as the vendor's client formats it, PHP
 * `gmdate('n/j/Y H:i A')`: month and day unpadded, a zero-padded 24-hour hour,
 * minutes, then AM/PM (e.g. `9/5/2026 13:04 PM`).
 */
export function deckTimestamp(now: Date = new Date()): string {
  const hour = now.getUTCHours()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCFullYear()} ` +
    `${pad(hour)}:${pad(now.getUTCMinutes())} ${hour < 12 ? 'AM' : 'PM'}`
  )
}

export class DeckCommerceClient {
  private readonly siteApiKey: string
  private readonly siteCode: string
  private readonly apiBaseUrl: string
  private hostCheck?: Promise<void>

  constructor(credentials: Credentials) {
    this.siteApiKey = credentials.accessToken
    this.siteCode = String(credentials.extra?.['siteCode'] ?? '')
    if (!this.siteCode) throw new Error('deck-commerce: credentials.extra.siteCode is required')
    // Re-validated here: the stored URL decides where signed requests go.
    this.apiBaseUrl = normaliseDeckApiBaseUrl(credentials.extra?.['apiBaseUrl'])
  }

  /** The base URL is customer-supplied: vet its host once before a signed request goes to it. */
  private ensurePublicHost(): Promise<void> {
    return (this.hostCheck ??= assertPublicHost(new URL(this.apiBaseUrl).hostname))
  }

  /**
   * POST to a Deck Commerce API.
   * apiName = the API name as Deck Commerce configures it, e.g. "api/PimInventoryLookup".
   *   It is lower-cased in the URL and in the signed token, as the vendor's client does.
   * extraBody = the payload beyond the auth fields.
   */
  async post<T>(apiName: string, extraBody: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.apiBaseUrl}/${apiName.toLowerCase()}`
    await this.ensurePublicHost()
    return withRetry(async () => {
      const timestampUtc = deckTimestamp()
      const token = buildToken(apiName, timestampUtc, this.siteApiKey)
      const body = {
        ...extraBody,
        VerificationKey: token,
        TimestampUTC: timestampUtc,
        SiteCode: this.siteCode,
      }
      const { data } = await axios.post<T>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token,
          apiVersion: API_VERSION,
        },
        timeout: 60_000,
      })
      return data
    })
  }
}
