/**
 * Salesforce REST API client: SOQL query and its `nextRecordsUrl`
 * continuation, against the org's own `instance_url`.
 *
 * "Use the Query resource to execute a SOQL query that returns all the
 * results in a single response, or if needed, returns part of the results and
 * a locator used to retrieve the remaining results." The continuation is the
 * response's `nextRecordsUrl`; "These requests use nextRecordsUrl, and don't
 * include any parameters."
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_query.htm
 *
 * Same request shape as crm/salesforce/client.ts (Bearer token, base
 * `{instance_url}/services/data/vXX.X`), copied for the project-reference
 * reason given in auth.ts.
 */
import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'

/**
 * Every call goes to the org's `instance_url` from the token response ("A
 * URL indicating the instance of the user's org"), which auth.ts keeps in
 * `credentials.extra.instanceUrl`. The header is "Authorization: Bearer
 * Access_Token" (OAuth Tokens and Scopes page).
 */
function instanceUrl(credentials: Credentials): string {
  const url = credentials.extra?.['instanceUrl']
  if (typeof url !== 'string' || !url) {
    throw Object.assign(
      new Error('Salesforce connection has no instanceUrl in credentials.extra: reconnect it'),
      { statusCode: 401 },
    )
  }
  return url.replace(/\/$/, '')
}

export interface SalesforceQueryResponse<T> {
  totalSize: number
  done: boolean
  nextRecordsUrl?: string
  records: T[]
}

export class SalesforceServiceClient {
  constructor(private readonly credentials: Credentials) {}

  private async request<T>(url: string, headers?: Record<string, string>): Promise<T> {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        Accept: 'application/json',
        ...headers,
      },
    })
    if (!res.ok) {
      // The body carries Salesforce's `errorCode` (INVALID_QUERY_LOCATOR among
      // them), which the row pager's `restartOn` reads from the message.
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Salesforce API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return (await res.json()) as T
  }

  /**
   * `GET /services/data/vXX.X/query/?q=...`. `batchSize`, when given, sets
   * `Sforce-Query-Options: batchSize=N` (200-2,000) on this request.
   * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/headers_queryoptions.htm
   */
  async query<T>(soql: string, batchSize?: number): Promise<SalesforceQueryResponse<T>> {
    const url = `${instanceUrl(this.credentials)}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(soql)}`
    const headers =
      batchSize !== undefined ? { 'Sforce-Query-Options': `batchSize=${batchSize}` } : undefined
    return this.request<SalesforceQueryResponse<T>>(url, headers)
  }

  /** The documented `nextRecordsUrl` is a path on the instance, e.g. `/services/data/v67.0/query/01gD...-2000`. */
  async queryNext<T>(nextRecordsUrl: string): Promise<SalesforceQueryResponse<T>> {
    if (!nextRecordsUrl.startsWith('/services/data/')) {
      throw new Error(`Salesforce nextRecordsUrl is not an instance path: ${nextRecordsUrl}`)
    }
    return this.request<SalesforceQueryResponse<T>>(
      `${instanceUrl(this.credentials)}${nextRecordsUrl}`,
    )
  }
}
