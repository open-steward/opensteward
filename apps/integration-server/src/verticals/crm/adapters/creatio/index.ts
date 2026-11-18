/**
 * Creatio adapter for the CRM vertical.
 *
 * Maps Creatio OData v4 API to canonical CRM resources.
 * Instance URL is read from `credentials.extra.instanceUrl` at runtime;
 * the constructor `instanceUrl` config option is used as a fallback / default.
 *
 * Coverage:
 *   Contacts      — list, get, create, update, delete  (full CRUD)
 *   Companies     — list, get, create, update, delete  (full CRUD)
 *   Deals         — list, get, create, update, delete  (full CRUD)
 *   Pipelines     — list, get                          (read-only; synthesised from OpportunityStage)
 *   Activities    — list, get, create, update, delete  (full CRUD)
 *   Notes         — list/get refuse (501): Creatio documents no Note object;
 *                   create/update/delete still target the undocumented
 *                   /0/odata/Note (follow-up: refuse them too)
 *
 * Auth: OAuth2 Authorization Code. Auth URL / token endpoint use instanceUrl.
 *
 * Docs: https://academy.creatio.com/docs/developer/integration_and_api/web_services_odata_v4/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import {
  assertPublicHost,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
} from '@opensteward/shared'
import { CreatioClient } from './client'
import { SELECT } from './constants'

/** "The response body can contain up to 20 000 records." — Creatio OData overview, Limitations. */
const MAX_TOP = 20000
/** Upper bound on OpportunityStage requests in listPipelines (1 000 000 stages). */
const MAX_STAGE_PAGES = 50
import { transformContact, untransformContact, type RawCreatioContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawCreatioAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawCreatioOpportunity } from './transform/deal'
import { transformPipeline, type RawCreatioStage } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawCreatioActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawCreatioNote } from './transform/note'

export interface CreatioAdapterConfig {
  /** OAuth2 client ID */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI */
  redirectUri?: string
  /** Creatio instance URL, e.g. https://yoursite.creatio.com */
  instanceUrl?: string
}

/**
 * Reduce a customer-typed Creatio address to the instance root the adapter
 * appends `/0/...` to: `acme.creatio.com` and
 * `https://acme.creatio.com/0/Shell/#Section/...` both become
 * `https://acme.creatio.com`; an on-site install under a path keeps it
 * (`https://crm.example.com/creatio/0/` → `https://crm.example.com/creatio`).
 * Rejects blanks, non-https schemes and embedded credentials with a message
 * naming the problem.
 */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('Creatio instance URL is required (e.g. https://yoursite.creatio.com).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('Creatio instance URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Creatio instance URL must use https://.')
  if (url.username || url.password) {
    throw new Error('Creatio instance URL must not contain a username or password.')
  }
  const path = url.pathname.replace(/\/0(?:\/.*)?$/, '').replace(/\/+$/, '')
  return `${url.origin}${path}`
}

interface CreatioTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

/**
 * POST to the instance's token endpoint (`{instance}/0/connect/token`). The
 * body carries the client secret, so the host must resolve to a public address
 * first.
 */
async function requestToken(
  instanceUrl: string,
  params: Record<string, string>,
  failure: string,
): Promise<CreatioTokenResponse> {
  await assertPublicHost(new URL(instanceUrl).hostname)
  const res = await fetch(`${instanceUrl}/0/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }
  return (await res.json()) as CreatioTokenResponse
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

export class CreatioAdapter implements CrmAdapter {
  readonly platform = 'creatio'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  /** Deployment-wide fallback. Per-customer instances arrive via `oauthFields`. */
  private instanceUrl: string | undefined

  constructor(config: CreatioAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.instanceUrl = config.instanceUrl
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** The instance recorded with the credentials at exchange, else the deployment-wide one. */
  private storedInstanceUrl(credentials: Credentials): string | undefined {
    const stored = credentials.extra?.['instanceUrl']
    return typeof stored === 'string' ? stored : this.instanceUrl
  }

  private client(credentials: Credentials): CreatioClient {
    return new CreatioClient(credentials, normaliseInstanceUrl(this.storedInstanceUrl(credentials)))
  }

  private top(params: QueryParams): number {
    return params.limit ?? 25
  }

  /**
   * One caller page of an OData collection: `$top` is the caller's limit,
   * clamped to the documented "The response body can contain up to 20 000
   * records.", and `$skip` is the 1-based page's offset at that size. The end
   * comes from `$count=true`; without a count, only a short page is an end.
   */
  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    entity: string,
    select: string,
  ): Promise<T[]> {
    const top = Math.min(this.top(params), MAX_TOP)
    const skip = pageOffset(params, top)
    const { items, count } = await this.client(credentials).listOrdered<T>(
      entity,
      select,
      skip,
      top,
    )
    reportUpstreamPage(params, {
      pageSize: top,
      ...(count !== undefined
        ? { totalCount: count, hasMore: skip + items.length < count }
        : items.length < top
          ? { hasMore: false }
          : {}),
    })
    return items
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Authorize, token and OData API all live on the customer's Creatio
   * instance, which deployment config cannot know. Asked for on the Connect
   * page before the redirect, then read back from `credentials.extra.instanceUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'Creatio URL',
        type: 'url',
        required: true,
        placeholder: 'https://yoursite.creatio.com',
        helpText: 'The https:// address you use to open Creatio.',
      },
    ]
  }

  /** Creatio's documented authorization-code endpoint is `{instance}/0/connect/authorize`. */
  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    const base = normaliseInstanceUrl(inputs?.instanceUrl ?? this.instanceUrl)
    const url = new URL(`${base}/0/connect/authorize`)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', (overrideScopes ?? ['openid', 'offline_access']).join(' '))
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.instanceUrl)
  }

  /** Exchange on the customer's instance and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, inputs.instanceUrl ?? this.instanceUrl)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    if (!this.clientId || !this.clientSecret) return credentials
    const base = normaliseInstanceUrl(this.storedInstanceUrl(credentials))
    const json = await requestToken(
      base,
      {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      },
      'Creatio token refresh failed',
    )
    return {
      ...credentials,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: expiryFrom(json.expires_in),
    }
  }

  private async exchange(
    code: string,
    redirectUri: string,
    candidate: string | undefined,
  ): Promise<Credentials> {
    const base = normaliseInstanceUrl(candidate)
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Creatio exchangeCode: clientId and clientSecret required')
    }
    const json = await requestToken(
      base,
      {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      'Creatio token exchange failed',
    )
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: expiryFrom(json.expires_in),
      extra: { instanceUrl: base },
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Creatio has no standard HMAC signing
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return [
      {
        platform: this.platform,
        type: String(payload['event'] ?? 'unknown'),
        resourceType: 'unknown',
        action: 'unknown',
        resourceId: String(payload['id'] ?? 'unknown'),
        payload,
      },
    ]
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageOf<RawCreatioContact>(
      credentials,
      params,
      'Contact',
      SELECT.CONTACT,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCreatioContact>('Contact', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawCreatioContact>(
      'Contact',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    await this.client(credentials).patch('Contact', id, untransformContact(data))
    // OData PATCH returns 204; re-fetch to return updated record
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contact', id)
  }

  // ── Companies (Account) ────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageOf<RawCreatioAccount>(
      credentials,
      params,
      'Account',
      SELECT.ACCOUNT,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCreatioAccount>('Account', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawCreatioAccount>(
      'Account',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    await this.client(credentials).patch('Account', id, untransformCompany(data))
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Account', id)
  }

  // ── Deals (Opportunity) ────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageOf<RawCreatioOpportunity>(
      credentials,
      params,
      'Opportunity',
      SELECT.OPPORTUNITY,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawCreatioOpportunity>('Opportunity', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawCreatioOpportunity>(
      'Opportunity',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    await this.client(credentials).patch('Opportunity', id, untransformDeal(data))
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Opportunity', id)
  }

  // ── Pipelines (OpportunityStage) ───────────────────────────────────────────

  /**
   * Every OpportunityStage folds into ONE synthesised pipeline, so all stages
   * are read (a page of up to 20 000 at a time, until a short page or the
   * `@odata.count` is reached) and that one row is paged locally. A page that
   * brings no new stage (an upstream ignoring `$skip`) ends the read, and
   * MAX_STAGE_PAGES bounds it outright, so it can never loop forever.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const stages: RawCreatioStage[] = []
    const seen = new Set<string>()
    for (let request = 0; request < MAX_STAGE_PAGES; request++) {
      const { items, count } = await client.listOrdered<RawCreatioStage>(
        'OpportunityStage',
        SELECT.OPPORTUNITY_STAGE,
        stages.length,
        MAX_TOP,
      )
      const fresh = items.filter((s) => !seen.has(s.Id))
      for (const s of fresh) seen.add(s.Id)
      stages.push(...fresh)
      if (
        fresh.length === 0 ||
        items.length < MAX_TOP ||
        (count !== undefined && stages.length >= count)
      ) {
        break
      }
    }
    return pageLocally([transformPipeline(stages)], params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const pipelines = await this.listPipelines(credentials, {})
    const found = pipelines.find((p) => p.id === id)
    if (!found) {
      throw Object.assign(new Error(`Creatio: pipeline not found: ${id}`), { statusCode: 404 })
    }
    return found
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.pageOf<RawCreatioActivity>(
      credentials,
      params,
      'Activity',
      SELECT.ACTIVITY,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawCreatioActivity>('Activity', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawCreatioActivity>(
      'Activity',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    await this.client(credentials).patch('Activity', id, untransformActivity(data))
    return this.getActivity(credentials, id)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Activity', id)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  /**
   * Creatio documents no Note object to list or read: "The Notes detail is used to
   * store additional text information about the section record."
   * (https://academy.creatio.com/guides/creatio-apps/8.0/platform-basics/user-interface/attachments-and-notes).
   * Notes are a `Notes` column on the record itself, and the stock-instance
   * relations in Creatio's OData 4 Postman collection include no Note object.
   * createNote, updateNote and deleteNote still target the undocumented Note
   * object and are left for a follow-up (write methods were out of scope).
   */
  private notesUnsupported(what: string): Error {
    return Object.assign(
      new Error(
        `Creatio cannot ${what} notes: "The Notes detail is used to store additional text information about the section record." Creatio's OData 4 reference documents no Note object.`,
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw this.notesUnsupported('list')
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw this.notesUnsupported('read')
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawCreatioNote>('Note', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    await this.client(credentials).patch('Note', id, untransformNote(data))
    return this.getNote(credentials, id)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Note', id)
  }
}
