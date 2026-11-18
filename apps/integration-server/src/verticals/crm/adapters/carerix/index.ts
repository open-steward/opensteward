/**
 * Carerix adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Carerix is a recruitment / staffing CRM built on a REST API at
 * https://api.carerix.com. Resources are typed objects (CREmployee, CRCompany,
 * CRPublication, CRNote, CRToDo) accessed via Bearer-token OAuth2.
 *
 * Mapping:
 *   Contact   → CREmployee   (candidate / contact record)
 *   Company   → CRCompany    (client organisation)
 *   Deal      → CRPublication (published vacancy)
 *   Note      → CRNote       (notes on candidates / companies)
 *   Activity  → CRToDo       (to-dos: tasks, meetings, e-mails, notes, ...)
 *   Pipeline  → CRDataNode status group (implicit pipeline via DataNodes)
 *
 * Auth: OAuth2 authorization-code flow via Keycloak at id.carerix.io.
 * Each customer's tenant slug determines the OIDC realm.
 *
 * Pagination: offset-based (`start` / `count`).
 * Webhooks: Carerix webhooks use custom headers (no HMAC); not implemented here.
 *
 * Docs: https://help.carerix.com/en/articles/9464648-carerix-rest-api
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { pageOffset, reportUpstreamPage, type CredentialField } from '@opensteward/shared'
import { CarerixClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseIdentityServer,
  normaliseTenantSlug,
  refreshToken as doRefreshToken,
} from './auth'
import { transformContact, untransformContact, type RawCarerixEmployee } from './transform/contact'
import { transformCompany, untransformCompany, type RawCarerixCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawCarerixPublication } from './transform/deal'
import { transformPipeline, type RawCarerixNodeType } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawCarerixTodo } from './transform/activity'
import { transformNote, untransformNote, type RawCarerixNote } from './transform/note'
import { DEFAULT_CARERIX_SCOPES, CARERIX_DEFAULT_PAGE_SIZE } from './constants'

export interface CarerixAdapterConfig {
  /**
   * Carerix system/tenant slug (the "system name" in Carerix docs).
   * Used to build per-tenant OIDC endpoints, e.g. "acmedemo".
   */
  tenantSlug?: string
  /**
   * Keycloak identity server host for that realm, e.g. "id-2.carerix.io".
   * Defaults to id.carerix.io. Per-customer values arrive via `oauthFields`.
   */
  identityServer?: string
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_CARERIX_SCOPES when omitted. */
  scopes?: string[]
}

export class CarerixAdapter implements CrmAdapter {
  readonly platform = 'carerix'
  readonly version = '0.1.0'

  /** Deployment-wide fallbacks. Per-customer realms arrive via `oauthFields`. */
  private tenantSlug: string | undefined
  private identityServer: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: CarerixAdapterConfig = {}) {
    this.tenantSlug = config.tenantSlug
    this.identityServer = config.identityServer
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_CARERIX_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * The realm (system name) and its identity server are the customer's, and
   * both are part of the authorize and token URLs — deployment config cannot
   * know them. Asked for on the Connect page before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'tenantSlug',
        label: 'Carerix system name',
        type: 'text',
        required: true,
        placeholder: 'acmedemo',
        helpText: 'The name of your Carerix system — the realm in your OpenID Configuration URL.',
      },
      {
        name: 'identityServer',
        label: 'Carerix identity server',
        type: 'select',
        required: false,
        options: [
          { value: 'id.carerix.io', label: 'id.carerix.io (default)' },
          { value: 'id-2.carerix.io', label: 'id-2.carerix.io' },
          { value: 'id-3.carerix.io', label: 'id-3.carerix.io' },
        ],
        helpText:
          'The host of the token URL in your OpenID Configuration. Leave the default unless yours differs.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      {
        tenantSlug: normaliseTenantSlug(inputs?.tenantSlug ?? this.tenantSlug),
        identityServer: normaliseIdentityServer(inputs?.identityServer || this.identityServer),
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.tenantSlug, this.identityServer)
  }

  /** Exchange on the customer's realm and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(
      code,
      redirectUri,
      inputs.tenantSlug ?? this.tenantSlug,
      inputs.identityServer || this.identityServer,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra ?? {}
    const stored = (key: string): string | undefined =>
      typeof extra[key] === 'string' ? (extra[key] as string) : undefined
    return doRefreshToken(
      {
        tenantSlug: normaliseTenantSlug(stored('tenantSlug') ?? this.tenantSlug),
        identityServer: normaliseIdentityServer(stored('identityServer') ?? this.identityServer),
        clientId: this.clientId ?? stored('clientId') ?? '',
        clientSecret: this.clientSecret ?? stored('clientSecret') ?? '',
      },
      credentials,
    )
  }

  private async exchange(
    code: string,
    redirectUri: string,
    tenantSlug: string | undefined,
    identityServer: string | undefined,
  ): Promise<Credentials> {
    const slug = normaliseTenantSlug(tenantSlug)
    const server = normaliseIdentityServer(identityServer)
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Carerix exchangeCode: clientId and clientSecret are required')
    }
    return doExchangeCode(
      {
        tenantSlug: slug,
        identityServer: server,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
      },
      code,
      redirectUri,
    )
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): CarerixClient {
    return new CarerixClient(credentials)
  }

  /**
   * One caller page of `GET /{entity}`, by Carerix's documented offset paging:
   * "start (string, optional, default: 0): Offset; number of objects to skip
   * from the beginning of the result." and "count (string, optional, default:
   * 10): Maximum number of objects to include in the result."
   * (https://help.carerix.com/en/articles/9470760-rest-api-methods)
   *
   * No maximum and no total are documented, so the end is a short page.
   */
  private async listPage<T>(
    credentials: Credentials,
    entity: string,
    params: QueryParams,
  ): Promise<T[]> {
    const count = params.limit ?? CARERIX_DEFAULT_PAGE_SIZE
    const start = pageOffset(params, count)
    const { items } = await this.client(credentials).list<T>(entity, { count, start })
    reportUpstreamPage(params, { hasMore: items.length >= count })
    return items
  }

  // ── Contacts (CREmployee) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawCarerixEmployee>(credentials, 'CREmployee', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCarerixEmployee>('CREmployee', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawCarerixEmployee>(
      'CREmployee',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawCarerixEmployee>(
      'CREmployee',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CREmployee', id)
  }

  // ── Companies (CRCompany) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawCarerixCompany>(credentials, 'CRCompany', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCarerixCompany>('CRCompany', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawCarerixCompany>(
      'CRCompany',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawCarerixCompany>(
      'CRCompany',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRCompany', id)
  }

  // ── Deals (CRPublication) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawCarerixPublication>(credentials, 'CRPublication', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawCarerixPublication>('CRPublication', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawCarerixPublication>(
      'CRPublication',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawCarerixPublication>(
      'CRPublication',
      id,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRPublication', id)
  }

  // ── Pipelines (CRDataNode status groups) ───────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // Fetch the publication status node type, which represents the vacancy pipeline.
    const items = await this.listPage<RawCarerixNodeType>(credentials, 'CRNodeType', params)
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawCarerixNodeType>('CRNodeType', id)
    return transformPipeline(raw)
  }

  // ── Activities (CRToDo) ────────────────────────────────────────────────────
  //
  // The entity is CRToDo, capital D: "CRToDo and it's virtual entities like
  // CRTask, CRNote, CRMeeting, CRCampaign supports email resource"
  // (https://help.carerix.com/en/articles/9464648-carerix-rest-api), and
  // Carerix's own client declares ENTITY = 'CRToDo'. The list is unfiltered,
  // so it carries every to-do type (tasks, meetings, e-mails, notes, ...);
  // transformActivity names each from todoTypeKey.
  //
  // create/update/delete below still address /CRTodo: write methods are out
  // of scope for this read rebuild.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawCarerixTodo>(credentials, 'CRToDo', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawCarerixTodo>('CRToDo', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawCarerixTodo>(
      'CRTodo',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawCarerixTodo>(
      'CRTodo',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRTodo', id)
  }

  // ── Notes (CRNote) ─────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawCarerixNote>(credentials, 'CRNote', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawCarerixNote>('CRNote', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawCarerixNote>('CRNote', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawCarerixNote>(
      'CRNote',
      id,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('CRNote', id)
  }
}
