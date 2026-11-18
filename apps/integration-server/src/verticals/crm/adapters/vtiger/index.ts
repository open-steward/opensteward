import {
  connectionScope,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
/**
 * Vtiger CRM adapter.
 *
 * Maps the Vtiger webservice.php API to canonical CRM resources.
 * Authentication is session-based (challenge-response MD5): there is no
 * OAuth2 flow. The adapter stores session tokens in `credentials.extra.session`
 * and re-authenticates transparently when a session expires.
 *
 * Docs: https://www.vtiger.com/docs/crm/api/
 *
 * Credentials:
 *   - `accessToken`       — Vtiger API key (access key from My Preferences)
 *   - `extra.username`    — Vtiger username
 *   - `extra.instanceUrl` — Vtiger instance base URL (e.g. https://acme.vtiger.com)
 *   - `extra.session`     — Current session token (managed internally)
 *
 * Coverage:
 *   - Contacts  (Contacts module)
 *   - Companies (Accounts module)
 *   - Deals     (Potentials module)
 *   - Pipelines (synthesised — Vtiger has no pipeline module)
 *   - Activities (Calendar module for tasks, then Events for calls/meetings)
 *   - Notes     (ModComments module)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { VtigerClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_LIMIT, MAX_QUERY_LIMIT } from './constants'
import { transformContact, untransformContact, type RawVtigerContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawVtigerCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawVtigerDeal } from './transform/deal'
import { buildSyntheticPipelines, buildSyntheticPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawVtigerActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawVtigerNote } from './transform/note'

/** The two webservice modules that hold activities, in walk order. */
const ACTIVITY_MODULES = ['Calendar', 'Events'] as const
type ActivityCursor = { module: (typeof ACTIVITY_MODULES)[number]; offset: number }

export interface VtigerAdapterConfig {
  /** Optional: override default instance URL. */
  instanceUrl?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class VtigerAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'vtiger'
  readonly version = '0.1.0'

  constructor(_config: VtigerAdapterConfig = {}) {}

  // ── Auth (no OAuth2) ──────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Vtiger uses API key auth — no OAuth2 redirect URL
    return '#vtiger-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('VtigerAdapter: OAuth2 not supported. Use API key auth.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-login to get a fresh session; session is stored in extra.session
    const client = new VtigerClient(credentials)
    const session = await client.login()
    return {
      ...credentials,
      extra: {
        ...credentials.extra,
        session,
      },
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): VtigerClient {
    return new VtigerClient(credentials)
  }

  private limitFrom(params: QueryParams): number {
    return params['limit'] !== undefined ? Number(params['limit']) : DEFAULT_LIMIT
  }

  /**
   * One caller page of a VTQL query. The documented clause is
   * "[LIMIT [<m>, ] <n>] … integer values to specify the offset and limit
   * respectively", and "Query always limits its output to 100 records", so
   * the size is clamped to 100 and the offset strides by the size sent.
   * `result` is a bare array with no next signal: a short page is the end.
   */
  private async queryPage<T>(
    credentials: Credentials,
    select: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = Math.min(this.limitFrom(params), MAX_QUERY_LIMIT)
    const offset = pageOffset(params, size)
    // <m> is optional; page 1 sends the bare `LIMIT <n>` form.
    const limit = offset > 0 ? `${offset}, ${size}` : `${size}`
    // The size sent is known before the call, so report it even if it throws.
    reportUpstreamPage(params, { pageSize: size })
    const items = await this.client(credentials).query<T>(`${select} LIMIT ${limit};`)
    reportUpstreamPage(params, { hasMore: items.length >= size })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.queryPage<RawVtigerContact>(
      credentials,
      'SELECT id,salutationtype,firstname,lastname,email,phone,title,accountid,assigned_user_id,createdtime,modifiedtime FROM Contacts',
      params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).retrieve<RawVtigerContact>(id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).create<RawVtigerContact>(
      'Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).update<RawVtigerContact>({
      id,
      ...untransformContact(data),
    })
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteRecord(id)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.queryPage<RawVtigerCompany>(
      credentials,
      'SELECT id,accountname,website,phone,description,assigned_user_id FROM Accounts',
      params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).retrieve<RawVtigerCompany>(id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).create<RawVtigerCompany>(
      'Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).update<RawVtigerCompany>({
      id,
      ...untransformCompany(data),
    })
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteRecord(id)
  }

  // ── Deals (Potentials) ────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.queryPage<RawVtigerDeal>(
      credentials,
      'SELECT id,potentialname,amount,closingdate,sales_stage,accountid,assigned_user_id,probability FROM Potentials',
      params,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).retrieve<RawVtigerDeal>(id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).create<RawVtigerDeal>(
      'Potentials',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).update<RawVtigerDeal>({
      id,
      ...untransformDeal(data),
    })
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteRecord(id)
  }

  // ── Pipelines (synthesised) ───────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return buildSyntheticPipelines()
  }

  async getPipeline(_credentials: Credentials, id: string): Promise<Pipeline> {
    const pipeline = buildSyntheticPipeline()
    if (id !== pipeline.id) {
      throw Object.assign(new Error(`Vtiger: pipeline '${id}' not found`), { statusCode: 404 })
    }
    return pipeline
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /**
   * Tasks, then calls and meetings. "Activities" is only a label: the vtap
   * relatedtypes example names its module `"name": "Calendar", "label":
   * "Activities"`, and the query operation takes a "Type or Module Name".
   * vtiger's VTQL parser narrows `FROM Calendar` to activitytype='Task' and
   * `FROM Events` to every other non-email activity, so both modules are
   * walked, each in upstream pages of the documented 100-row maximum
   * (`LIMIT <offset>, 100`). A short page ends a module; `result` is a bare
   * array with no other end signal. pageByRows cuts the caller's rows out of
   * the two streams and reports hasMore exactly.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const instance = String(credentials.extra?.['instanceUrl'] ?? '')
    const username = String(credentials.extra?.['username'] ?? '')
    const key = `vtiger:${connectionScope(`${instance}|${username}`, credentials)}:activities`
    const { items } = await pageByRows<RawVtigerActivity, ActivityCursor>(
      key,
      params,
      async (cursor) => {
        const at = cursor ?? { module: ACTIVITY_MODULES[0], offset: 0 }
        const limit = at.offset > 0 ? `${at.offset}, ${MAX_QUERY_LIMIT}` : `${MAX_QUERY_LIMIT}`
        // "[ORDER BY <column_list>]" is in the documented grammar, and the VTQL
        // parser maps `id` to the module's primary key column, so LIMIT m, n
        // strides a stable order rather than whatever order MySQL returns.
        const rows = await client.query<RawVtigerActivity>(
          `SELECT * FROM ${at.module} ORDER BY id LIMIT ${limit};`,
        )
        if (rows.length >= MAX_QUERY_LIMIT) {
          return { items: rows, next: { module: at.module, offset: at.offset + MAX_QUERY_LIMIT } }
        }
        const following = ACTIVITY_MODULES[ACTIVITY_MODULES.indexOf(at.module) + 1]
        return { items: rows, next: following ? { module: following, offset: 0 } : undefined }
      },
      { defaultLimit: DEFAULT_LIMIT },
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).retrieve<RawVtigerActivity>(id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).create<RawVtigerActivity>(
      'Activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).update<RawVtigerActivity>({
      id,
      ...untransformActivity(data),
    })
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteRecord(id)
  }

  // ── Notes (ModComments) ───────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.queryPage<RawVtigerNote>(
      credentials,
      'SELECT id,commentcontent,assigned_user_id,related_id,related_to,createdtime FROM ModComments',
      params,
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).retrieve<RawVtigerNote>(id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).create<RawVtigerNote>(
      'ModComments',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteRecord(id)
  }
}
