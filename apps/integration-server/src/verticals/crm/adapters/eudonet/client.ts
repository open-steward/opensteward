/**
 * EudonetClient — thin HTTP wrapper for the Eudonet EudoAPI.
 *
 * Authentication: token-based. The session token is obtained by POSTing
 * subscriber + user credentials to /Authenticate/Token and is attached as the
 * `x-auth` header on all subsequent requests.
 *
 * Because the token is valid for ~1 h and we obtain it lazily per request, we
 * cache it on the instance so that within a single adapter call (e.g. a
 * list that walks pages) we do not re-authenticate on every page.
 *
 * The `instanceUrl` (base URL up to and including `/EudoAPI`) is taken from
 * `credentials.extra.instanceUrl` when present, falling back to the default
 * demo host so integrations that omit it still get a valid URL shape.
 *
 * Ref: http://demo.eudonet.com/eudoapi/eudoapidoc/swaggerui/
 */

import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface EudonetField {
  DescId: number
  Value: unknown
}

export interface EudonetRow {
  FileId: number
  Fields: EudonetField[]
}

export interface EudonetResultData {
  Rows?: EudonetRow[]
  /** Present on single-record GET responses. */
  Row?: EudonetRow
  Token?: string
  ExpirationDate?: string
  ServerDate?: string
}

export interface EudonetResultMetaData {
  TotalPages?: number
  TotalRows?: number
}

export interface EudonetResultInfos {
  Success: boolean
  ErrorNumber?: number
  ErrorMessage?: string
}

export interface EudonetResponse<D = EudonetResultData> {
  ResultInfos: EudonetResultInfos
  ResultData: D
  ResultMetaData?: EudonetResultMetaData
}

export interface EudonetSearchBody {
  ShowMetadata?: boolean
  RowsPerPage?: number
  NumPage?: number
  ListCols?: number[]
  WhereCustom?: EudonetWhereCustom[]
}

export interface EudonetWhereCustom {
  Criteria: {
    Field: number
    Operator: string
    Value: unknown
  }
  InterOperator?: string
}

export interface EudonetCudBody {
  Fields: { DescId: number; Value: unknown }[]
}

// ── Auth credentials shape ────────────────────────────────────────────────────

export interface EudonetCredentials {
  subscriberLogin: string
  subscriberPassword: string
  baseName: string
  userLogin: string
  userPassword: string
  userLang: string
  productName: string
  instanceUrl?: string
}

// ── Client ────────────────────────────────────────────────────────────────────

export class EudonetClient {
  private creds: EudonetCredentials
  private baseUrl: string
  private cachedToken: string | null = null

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Partial<EudonetCredentials>
    this.creds = {
      subscriberLogin:   extra.subscriberLogin   ?? credentials.accessToken,
      subscriberPassword: extra.subscriberPassword ?? credentials.refreshToken ?? '',
      baseName:          extra.baseName           ?? '',
      userLogin:         extra.userLogin          ?? '',
      userPassword:      extra.userPassword       ?? '',
      userLang:          extra.userLang           ?? 'fr',
      productName:       extra.productName        ?? 'EudoAPI',
    }
    this.baseUrl = (extra.instanceUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    // Token is obtained lazily on first request via getToken().
    // credentials.accessToken is a sentinel string (e.g. 'eudonet:<subscriber>'),
    // not a real Eudonet session token — do NOT pre-populate cachedToken.
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async token(): Promise<string> {
    if (this.cachedToken) return this.cachedToken

    const res = await fetch(`${this.baseUrl}/Authenticate/Token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SubscriberLogin:   this.creds.subscriberLogin,
        SubscriberPassword: this.creds.subscriberPassword,
        BaseName:          this.creds.baseName,
        UserLogin:         this.creds.userLogin,
        UserPassword:      this.creds.userPassword,
        UserLang:          this.creds.userLang,
        ProductName:       this.creds.productName,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Eudonet authentication failed ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }

    const json = (await res.json()) as EudonetResponse<{ Token: string }>
    if (!json.ResultInfos?.Success) {
      throw Object.assign(
        new Error(`Eudonet authentication error ${json.ResultInfos?.ErrorNumber}: ${json.ResultInfos?.ErrorMessage}`),
        { statusCode: 401 },
      )
    }

    this.cachedToken = json.ResultData.Token
    return this.cachedToken
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-auth': token,
    }
  }

  private async checkResult(json: EudonetResponse): Promise<void> {
    if (!json.ResultInfos?.Success) {
      throw Object.assign(
        new Error(`Eudonet API error ${json.ResultInfos?.ErrorNumber}: ${json.ResultInfos?.ErrorMessage}`),
        { statusCode: 400 },
      )
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * POST /Search/{tabId} — advanced search with pagination.
   * Returns the full response so callers can read ResultMetaData.TotalPages.
   */
  async search(tabId: number, body: EudonetSearchBody): Promise<EudonetResponse> {
    const tok = await this.token()
    const res = await fetch(`${this.baseUrl}/Search/${tabId}`, {
      method: 'POST',
      headers: this.authHeaders(tok),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Eudonet search ${tabId} error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    const json = (await res.json()) as EudonetResponse
    await this.checkResult(json)
    return json
  }

  /**
   * GET /Search/{tabId}/{fileId} — fetch a single record by ID.
   */
  async getFile(tabId: number, fileId: string | number): Promise<EudonetRow | undefined> {
    const tok = await this.token()
    const res = await fetch(`${this.baseUrl}/Search/${tabId}/${fileId}`, {
      headers: this.authHeaders(tok),
    })
    if (res.status === 404) return undefined
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Eudonet getFile ${tabId}/${fileId} error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    const json = (await res.json()) as EudonetResponse
    await this.checkResult(json)
    // Single-record responses may use Row or Rows[0].
    return json.ResultData?.Row ?? json.ResultData?.Rows?.[0]
  }

  /**
   * POST /CUD/{tabId} — create a new record.
   * Returns the created record's FileId.
   */
  async create(tabId: number, body: EudonetCudBody): Promise<number> {
    const tok = await this.token()
    const res = await fetch(`${this.baseUrl}/CUD/${tabId}`, {
      method: 'POST',
      headers: this.authHeaders(tok),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Eudonet create ${tabId} error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    const json = (await res.json()) as EudonetResponse<{ FileId?: number; Rows?: EudonetRow[] }>
    await this.checkResult(json as unknown as EudonetResponse)
    return (json.ResultData as { FileId?: number }).FileId ?? 0
  }

  /**
   * POST /CUD/{tabId}/{fileId} — update an existing record.
   */
  async update(tabId: number, fileId: string | number, body: EudonetCudBody): Promise<void> {
    const tok = await this.token()
    const res = await fetch(`${this.baseUrl}/CUD/${tabId}/${fileId}`, {
      method: 'POST',
      headers: this.authHeaders(tok),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Eudonet update ${tabId}/${fileId} error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    const json = (await res.json()) as EudonetResponse
    await this.checkResult(json)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the string value of a specific field from a EudonetRow.
 * Returns undefined when the field is absent or null.
 */
export function fieldValue(row: EudonetRow, descId: number): string | undefined {
  const f = row.Fields?.find(f => f.DescId === descId)
  if (f == null || f.Value == null) return undefined
  const s = String(f.Value).trim()
  return s === '' ? undefined : s
}

/**
 * Extract a numeric value from a EudonetRow field.
 */
export function fieldNumber(row: EudonetRow, descId: number): number | undefined {
  const s = fieldValue(row, descId)
  if (s == null) return undefined
  const n = Number(s)
  return isNaN(n) ? undefined : n
}
