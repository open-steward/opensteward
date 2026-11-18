/**
 * SuperOffice CRM adapter for the CRM vertical.
 *
 * Maps the SuperOffice REST WebAPI to canonical CRM resources.
 * Docs: https://docs.superoffice.com/en/api/reference/restful/rest/
 *
 * Auth: OAuth2 authorization code at the production SuperID login host.
 * Each tenant has its own REST base, read from the id_token's `webapi_url`
 * claim at token exchange and stored as `credentials.extra.instanceUrl`.
 *
 *   - "Contact" entity = company/organisation in SuperOffice
 *   - "Person" entity = individual contact in SuperOffice
 *   - "SaleType" list item = pipeline; its selected stages are the stages
 *
 * Lists page through the documented OData get-all operations
 * (https://docs.superoffice.com/en/api/search/odata/index):
 *   "$top  int32  Number of rows to return in results"
 *   "$skip int32  Number of rows from database to skip before returning results"
 *   "$select string Comma-separated list of column names to return."
 *   "$orderBy string Comma separated list of column names to sort by"
 * No maximum page size is documented, so none is declared.
 */

import {
  DEFAULT_PAGE_LIMIT,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'

import { SuperofficeClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { OAUTH_AUTH_URL, OAUTH_SCOPE, OAUTH_TOKEN_URL, WEBAPI_URL_CLAIM } from './constants'
import {
  PERSON_COLUMNS,
  transformContact,
  transformContactRow,
  untransformContact,
  type RawSuperoffficePerson,
} from './transform/contact'
import {
  CONTACT_COLUMNS,
  transformCompany,
  transformCompanyRow,
  untransformCompany,
  type RawSuperofficeCompany,
} from './transform/company'
import {
  SALE_COLUMNS,
  transformDeal,
  transformDealRow,
  untransformDeal,
  type RawSuperofficeSale,
} from './transform/deal'
import { transformPipeline, type RawSuperofficeSaleType } from './transform/pipeline'
import {
  APPOINTMENT_COLUMNS,
  transformActivity,
  transformActivityRow,
  untransformActivity,
  type RawSuperofficeAppointment,
} from './transform/activity'

export interface SuperOfficeAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/**
 * Token response, per
 * https://docs.superoffice.com/en/api/authentication/online/sign-in-user/auth-code-flow:
 * token_type, access_token, expires_in, refresh_token and id_token ("JSON Web
 * Token or JWT, which consists of a Header, Payload, and Signature."). A
 * refresh response "contains the token type, access token, expiration in
 * seconds, and id token."
 */
interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

/**
 * The tenant REST base from an id_token: its `webapi_url` claim ("The URL to a
 * tenant REST web services.", e.g. https://sod.superoffice.com/Cust26759/api/)
 * with the `v1` of the documented `/api/v1/...` operation paths.
 *
 * The token arrives straight from the SuperID token endpoint over TLS; the
 * claim is only read here, not trusted for identity.
 */
export function webApiBaseFromIdToken(idToken: unknown): string | undefined {
  if (typeof idToken !== 'string') return undefined
  const payload = idToken.split('.')[1]
  if (!payload) return undefined
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
  const url = (claims as Record<string, unknown> | null)?.[WEBAPI_URL_CLAIM]
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return undefined
  return `${url.replace(/\/+$/, '')}/v1`
}

/** Rows asked for and skipped, from the caller's 1-based page and limit. */
function odataWindow(params: QueryParams): { $top: number; $skip: number } {
  const limit =
    typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
      ? Math.floor(params.limit)
      : DEFAULT_PAGE_LIMIT
  return { $top: limit, $skip: pageOffset(params, limit) }
}

export class SuperOfficeAdapter implements CrmAdapter {
  readonly platform = 'superoffice'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: SuperOfficeAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Authorization request, per the auth-code-flow parameter table: client_id,
   * scope ("Must be `openid`."), redirect_uri, state, response_type ("Must
   * include `code` for the Authorization Code flow."). The scope is fixed, so
   * a per-call scope override is ignored.
   */
  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    // `openid` is required; a Connect Link scope override is added to it, never dropped.
    const scopes = overrideScopes?.length
      ? [...new Set([OAUTH_SCOPE, ...overrideScopes])]
      : [OAUTH_SCOPE]
    url.searchParams.set('scope', scopes.join(' '))
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('state', state)
    url.searchParams.set('response_type', 'code')
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('SuperOffice: clientId and clientSecret required')
    }
    const json = await this.token({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    if (!json) throw new Error('SuperOffice token exchange failed')
    const instanceUrl = webApiBaseFromIdToken(json.id_token)
    if (!instanceUrl) {
      throw new Error('SuperOffice token exchange returned no id_token webapi_url claim')
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
      extra: { instanceUrl },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken || !this.clientId || !this.clientSecret) return credentials
    const json = await this.token({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: credentials.refreshToken,
    })
    if (!json) return credentials
    return {
      ...credentials,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
      extra: {
        ...credentials.extra,
        instanceUrl:
          webApiBaseFromIdToken(json.id_token) ??
          (credentials.extra?.['instanceUrl'] as string | undefined),
      },
    }
  }

  /** POST to the tokens endpoint; a failed code exchange throws, a failed refresh returns undefined. */
  private async token(form: Record<string, string>): Promise<TokenResponse | undefined> {
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(form).toString(),
    })
    if (!res.ok) {
      if (form['grant_type'] === 'refresh_token') return undefined
      const detail = await res.text().catch(() => res.statusText)
      throw new Error(`SuperOffice token exchange failed: ${detail}`)
    }
    return (await res.json()) as TokenResponse
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SuperofficeClient {
    return new SuperofficeClient(credentials)
  }

  /**
   * One caller page of an OData get-all, in primary-key order so page N is
   * the same rows on every call. `odata.nextLink` is the platform's own
   * "more rows" signal; without it nothing is claimed and the short-page
   * rule decides.
   */
  private async odataPage(
    credentials: Credentials,
    path: string,
    columns: readonly string[],
    orderBy: string,
    params: QueryParams,
    extra: Record<string, string> = {},
  ): Promise<Record<string, unknown>[]> {
    const { rows, nextLink } = await this.client(credentials).odata(path, {
      $select: columns.join(','),
      $orderBy: orderBy,
      ...odataWindow(params),
      ...extra,
    })
    if (nextLink !== undefined) reportUpstreamPage(params, { hasMore: true })
    return rows
  }

  // ── Contacts (Persons in SuperOffice) ─────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.odataPage(credentials, '/Person', PERSON_COLUMNS, 'personId', params)
    return rows.map(transformContactRow)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawSuperoffficePerson>(
      `/Person/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSuperoffficePerson>('/Person', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSuperoffficePerson>(`/Person/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Person/${id}`)
  }

  // ── Companies (Contacts in SuperOffice) ───────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.odataPage(credentials, '/Contact', CONTACT_COLUMNS, 'contactId', params)
    return rows.map(transformCompanyRow)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawSuperofficeCompany>(
      `/Contact/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSuperofficeCompany>('/Contact', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSuperofficeCompany>(`/Contact/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Contact/${id}`)
  }

  // ── Deals (Sales in SuperOffice) ──────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.odataPage(credentials, '/Sale', SALE_COLUMNS, 'saleId', params)
    return rows.map(transformDealRow)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawSuperofficeSale>(
      `/Sale/${encodeURIComponent(id)}`,
    )
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSuperofficeSale>('/Sale', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSuperofficeSale>(`/Sale/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Sale/${id}`)
  }

  // ── Pipelines (SaleTypes in SuperOffice) ──────────────────────────────────

  /**
   * GET /api/v1/List/SaleType/Items — "Gets a list of all SaleTypeEntity list
   * items." Its only query parameter is `includeDeleted`: no paging, the
   * whole list in one array, so it is paged locally.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const types =
      await this.client(credentials).get<RawSuperofficeSaleType[]>('/List/SaleType/Items')
    if (!Array.isArray(types)) {
      throw new Error('SuperOffice /List/SaleType/Items: response is not an array')
    }
    return pageLocally(types.map(transformPipeline), params)
  }

  // ── Activities (Appointments in SuperOffice) ──────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.odataPage(
      credentials,
      '/Appointment',
      APPOINTMENT_COLUMNS,
      'appointmentId',
      params,
      { $output: 'Logical' },
    )
    return rows.map(transformActivityRow)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawSuperofficeAppointment>(
      `/Appointment/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSuperofficeAppointment>('/Appointment', body)
    return transformActivity(res)
  }
}
