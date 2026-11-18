/**
 * Corteza CRM adapter — OpenSteward CRM vertical.
 *
 * Maps the Corteza Compose REST API to canonical CRM resources:
 * contacts, companies (accounts), deals (opportunities), activities (tasks),
 * notes, and a synthesised pipeline view.
 *
 * Corteza is a self-hosted low-code platform; the base URL is determined by
 * the customer's deployment. Auth uses the standard OAuth2 authorization-code
 * flow with Bearer JWT tokens.
 *
 * API structure:
 *   GET/POST/DELETE {baseUrl}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/[{recordID}]
 * The IDs are numeric. The CRM namespace (slug `crm`) and its modules
 * (handles Contact, Account, Opportunity, Task, Note) are looked up once per
 * connection through the documented `?slug=` and `?handle=` filters.
 * Pagination: `limit` plus an opaque `pageCursor` taken from
 * `filter.nextPage`, which is omitted on the last page.
 * Response envelope: { response: { filter: {...}, set: [...] } }
 *
 * Docs: https://docs.cortezaproject.org/corteza-docs/2024.9/integrator-guide/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
} from '@opensteward/shared'
import { CortezaClient, type CortezaModuleRef, type CortezaRecord } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseBaseUrl,
  refreshToken as doRefreshToken,
} from './auth'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { getCortezaPipeline, CORTEZA_CRM_PIPELINE_ID } from './transform/pipeline'
import { transformActivity, untransformActivity } from './transform/activity'
import { transformNote, untransformNote } from './transform/note'
import {
  DEFAULT_NAMESPACE_SLUG,
  DEFAULT_CORTEZA_SCOPES,
  MODULE_CONTACT,
  MODULE_ACCOUNT,
  MODULE_OPPORTUNITY,
  MODULE_TASK,
  MODULE_NOTE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'

export interface CortezaCrmAdapterConfig {
  /**
   * Deployment-wide Corteza server, e.g. `https://your.corteza.example`.
   * Optional: Corteza is self-hosted, so the server normally comes from the
   * customer at connect time (`oauthFields`) and is then read back from
   * `credentials.extra.baseUrl`. There is no default instance.
   */
  baseUrl?: string
  /** OAuth2 client ID registered in Corteza Admin > Auth clients. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to ['api']. */
  scopes?: string[]
  /**
   * Namespace slug for the CRM application.
   * Defaults to 'crm' (the default Corteza CRM app bundle slug).
   */
  namespaceSlug?: string
}

export class CortezaCrmAdapter implements CrmAdapter {
  readonly platform = 'corteza-crm'
  readonly version = '0.1.0'
  /** server/compose/rest/record.go: `maxRecordSearchSize = 1000`, clamped silently. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  /** Deployment-wide fallback. Per-customer servers arrive via `oauthFields`. */
  private baseUrl: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]
  private namespaceSlug: string
  /** Resolved numeric IDs, per connection and module handle. */
  private refs = new Map<string, Promise<CortezaModuleRef>>()

  constructor(config: CortezaCrmAdapterConfig = {}) {
    this.baseUrl = config.baseUrl
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_CORTEZA_SCOPES]
    this.namespaceSlug = config.namespaceSlug ?? DEFAULT_NAMESPACE_SLUG
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Corteza is self-hosted: authorize, token and API live on the customer's
   * own server, which deployment config cannot know. Asked for on the Connect
   * page before the redirect, then read back from `credentials.extra.baseUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'baseUrl',
        label: 'Corteza URL',
        type: 'url',
        required: true,
        placeholder: 'https://corteza.example.com',
        helpText: 'The https:// address of your Corteza server.',
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
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        baseUrl: this.resolveBaseUrl(inputs?.baseUrl),
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl())
  }

  /** Exchange on the customer's server and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl(inputs.baseUrl))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra ?? {}
    const clientId =
      this.clientId ?? (typeof extra['clientId'] === 'string' ? extra['clientId'] : '')
    const clientSecret =
      this.clientSecret ?? (typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : '')
    return doRefreshToken(
      { clientId, clientSecret, baseUrl: this.storedBaseUrl(credentials) },
      credentials,
    )
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async exchange(code: string, redirectUri: string, baseUrl: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('CortezaCrmAdapter exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
        baseUrl,
      },
      code,
      redirectUri,
    )
  }

  /** The customer's server when supplied, else the deployment-wide one — normalised or a readable error. */
  private resolveBaseUrl(candidate?: string): string {
    return normaliseBaseUrl(candidate ?? this.baseUrl)
  }

  /** The server recorded with the credentials at exchange, else the deployment-wide one. */
  private storedBaseUrl(credentials: Credentials): string | undefined {
    const stored = credentials.extra?.['baseUrl']
    return typeof stored === 'string' ? stored : this.baseUrl
  }

  private origin(credentials: Credentials): string {
    return normaliseBaseUrl(this.storedBaseUrl(credentials))
  }

  /**
   * The numeric namespace and module IDs behind a module handle. Record routes
   * take IDs only ("namespaceID — Namespace ID", "moduleID — Module ID"), so
   * they are found through GET /compose/namespace/?slug= and
   * GET /compose/namespace/{namespaceID}/module/?handle=, then remembered for
   * this connection. A failed lookup is not remembered.
   */
  private async ref(
    credentials: Credentials,
    handle: string,
  ): Promise<{
    client: CortezaClient
    ref: CortezaModuleRef
    scope: string
  }> {
    const origin = this.origin(credentials)
    const client = new CortezaClient(credentials, origin)
    const scope = connectionScope(origin, credentials)
    const key = `${scope}|${this.namespaceSlug}|${handle}`
    let pending = this.refs.get(key)
    if (!pending) {
      pending = (async () => {
        const namespaceID = await client.findNamespaceId(this.namespaceSlug)
        const moduleID = await client.findModuleId(namespaceID, handle)
        return { namespaceID, moduleID }
      })()
      this.refs.set(key, pending)
      pending.catch(() => this.refs.delete(key))
    }
    return { client, ref: await pending, scope }
  }

  /**
   * One caller page of a module's records: the caller's `limit` (clamped to
   * 1000) and 1-based `page`, walked over Corteza's `pageCursor` chain.
   * Upstream page k is caller page k at the size sent; `hasMore` is whether
   * Corteza returned `filter.nextPage`.
   */
  private async pageRecords(
    credentials: Credentials,
    handle: string,
    params: QueryParams,
  ): Promise<CortezaRecord[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const { client, ref, scope } = await this.ref(credentials, handle)
    const key = cursorPagerKey(scope, `${ref.namespaceID}/${ref.moduleID}`, { limit })
    const { items, hasMore } = await pageByCursor<CortezaRecord>(key, params.page, (cursor) =>
      client.listPage(ref, limit, cursor),
    )
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  /** Run `fn` against the resolved module for `handle`. */
  private async withModule<T>(
    credentials: Credentials,
    handle: string,
    fn: (client: CortezaClient, ref: CortezaModuleRef) => Promise<T>,
  ): Promise<T> {
    const { client, ref } = await this.ref(credentials, handle)
    return fn(client, ref)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageRecords(credentials, MODULE_CONTACT, params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.withModule(credentials, MODULE_CONTACT, (c, ref) => c.get(ref, id))
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.withModule(credentials, MODULE_CONTACT, (c, ref) =>
      c.create(ref, untransformContact(data)),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.withModule(credentials, MODULE_CONTACT, (c, ref) =>
      c.update(ref, id, untransformContact(data)),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.withModule(credentials, MODULE_CONTACT, (c, ref) => c.delete(ref, id))
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageRecords(credentials, MODULE_ACCOUNT, params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.withModule(credentials, MODULE_ACCOUNT, (c, ref) => c.get(ref, id))
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.withModule(credentials, MODULE_ACCOUNT, (c, ref) =>
      c.create(ref, untransformCompany(data)),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.withModule(credentials, MODULE_ACCOUNT, (c, ref) =>
      c.update(ref, id, untransformCompany(data)),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.withModule(credentials, MODULE_ACCOUNT, (c, ref) => c.delete(ref, id))
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageRecords(credentials, MODULE_OPPORTUNITY, params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.withModule(credentials, MODULE_OPPORTUNITY, (c, ref) => c.get(ref, id))
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.withModule(credentials, MODULE_OPPORTUNITY, (c, ref) =>
      c.create(ref, untransformDeal(data)),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.withModule(credentials, MODULE_OPPORTUNITY, (c, ref) =>
      c.update(ref, id, untransformDeal(data)),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.withModule(credentials, MODULE_OPPORTUNITY, (c, ref) => c.delete(ref, id))
  }

  // ── Pipelines (synthesised — Corteza has no pipeline API) ─────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return [getCortezaPipeline()]
  }

  async getPipeline(_credentials: Credentials, id: string): Promise<Pipeline> {
    if (id === CORTEZA_CRM_PIPELINE_ID) return getCortezaPipeline()
    throw Object.assign(new Error(`CortezaCrmAdapter: pipeline '${id}' not found`), {
      statusCode: 404,
    })
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.pageRecords(credentials, MODULE_TASK, params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.withModule(credentials, MODULE_TASK, (c, ref) => c.get(ref, id))
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.withModule(credentials, MODULE_TASK, (c, ref) =>
      c.create(ref, untransformActivity(data)),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.withModule(credentials, MODULE_TASK, (c, ref) =>
      c.update(ref, id, untransformActivity(data)),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.withModule(credentials, MODULE_TASK, (c, ref) => c.delete(ref, id))
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.pageRecords(credentials, MODULE_NOTE, params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.withModule(credentials, MODULE_NOTE, (c, ref) => c.get(ref, id))
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.withModule(credentials, MODULE_NOTE, (c, ref) =>
      c.create(ref, untransformNote(data)),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.withModule(credentials, MODULE_NOTE, (c, ref) =>
      c.update(ref, id, untransformNote(data)),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.withModule(credentials, MODULE_NOTE, (c, ref) => c.delete(ref, id))
  }
}
