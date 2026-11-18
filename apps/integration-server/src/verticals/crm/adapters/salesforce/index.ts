/**
 * Salesforce adapter for the CRM vertical.
 *
 * Maps the Salesforce REST API (v60.0) to canonical CRM resources. Auth is
 * OAuth2 via login.salesforce.com; the instance URL returned at token
 * exchange is stored in `credentials.extra.instanceUrl` and used as the
 * base for every subsequent API call.
 *
 * Docs: https://developer.salesforce.com/docs/apis
 *
 * Resources implemented:
 *   - Contacts     (Contact sobject)
 *   - Companies    (Account sobject)
 *   - Deals        (Opportunity sobject)
 *   - Pipelines    (read-only; synthesised from StageName picklist)
 *   - Activities   (Task + Event sobjects — see listActivities)
 *   - Notes        (Note sobject)
 *
 * Pagination: SOQL has no usable OFFSET past 2,000 rows
 * (NUMBER_OUTSIDE_VALID_RANGE), so every list walks Salesforce's
 * `nextRecordsUrl` chain, in batches of 200–2,000 rows, and the shared row
 * pager cuts the caller's pages out of them — see `listSoqlRows` below and
 * `@opensteward/shared`'s `adapter/row-pager.ts`.
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
  pageByRows,
  pageLocally,
  cursorPagerKey,
  connectionScope,
  type PagedResult,
} from '@opensteward/shared'

import { SalesforceClient } from './client'
import * as Auth from './auth'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { MIN_QUERY_BATCH_SIZE, MAX_QUERY_BATCH_SIZE, EVENT_ID_PREFIX } from './constants'

import {
  transformContact, untransformContact, type RawSalesforceContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawSalesforceAccount,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawSalesforceOpportunity,
} from './transform/deal'
import {
  transformPipeline, type RawSalesforcePicklistValue,
} from './transform/pipeline'
import {
  transformActivity, untransformActivity, transformEvent, untransformEvent,
  type RawSalesforceTask, type RawSalesforceEvent,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawSalesforceNote,
} from './transform/note'

export interface SalesforceAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

const CONTACT_SOQL =
  'SELECT Id,FirstName,LastName,Email,Phone,Title,AccountId,OwnerId,CreatedDate,LastModifiedDate FROM Contact'
const ACCOUNT_SOQL =
  'SELECT Id,Name,Website,Phone,Description,OwnerId,CreatedDate,LastModifiedDate FROM Account'
const OPPORTUNITY_SOQL =
  'SELECT Id,Name,Amount,StageName,CloseDate,AccountId,OwnerId,Probability,CreatedDate FROM Opportunity'
const TASK_SOQL =
  'SELECT Id,Subject,Description,ActivityDate,Status,OwnerId,WhoId,WhatId,AccountId,CreatedDate,LastModifiedDate FROM Task'
// No Status — Event has no such field, and selecting it fails the query.
const EVENT_SOQL =
  'SELECT Id,Subject,Description,StartDateTime,EndDateTime,DurationInMinutes,IsAllDayEvent,OwnerId,WhoId,WhatId,AccountId,CreatedDate,LastModifiedDate FROM Event'
const NOTE_SOQL =
  'SELECT Id,Title,Body,ParentId,OwnerId,CreatedDate FROM Note'

/** The caller's page size when a direct call names none. */
const DEFAULT_LIST_LIMIT = 25

/** One SOQL batch, and the `nextRecordsUrl` that continues it (absent at the end). */
interface SoqlBatch<T> {
  records: T[]
  next?: string
}

/**
 * Where the Task-then-Event stream of `listActivities` continues: the sObject,
 * and within it the `nextRecordsUrl` of its next batch (absent: its first).
 */
type ActivityCursor = { obj: 'Task' | 'Event'; next?: string }

type ActivityRow =
  | { obj: 'Task'; raw: RawSalesforceTask }
  | { obj: 'Event'; raw: RawSalesforceEvent }

/**
 * Salesforce refused a query locator (`nextRecordsUrl`): the chain behind it is
 * gone, and the row pager walks again from a fresh `query`. The client puts the
 * response body, with its `errorCode`, in the message.
 */
function isExpiredLocator(err: unknown): boolean {
  return err instanceof Error && err.message.includes('INVALID_QUERY_LOCATOR')
}

export class SalesforceAdapter implements CrmAdapter {
  readonly platform = 'salesforce'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: SalesforceAdapterConfig = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.redirectUri = config.redirectUri ?? ''
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return Auth.getAuthUrl(this.clientId, this.redirectUri, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return Auth.exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return Auth.refreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesforceClient {
    return new SalesforceClient(credentials)
  }

  /**
   * The SOQL batch size for a caller's limit: Salesforce refuses a
   * `batchSize` outside 200–2,000, so a smaller limit still gets 200-row
   * batches and the row pager cuts the caller's page out of them.
   */
  private batchSize(params: QueryParams): number {
    const limit = typeof params.limit === 'number' ? params.limit : DEFAULT_LIST_LIMIT
    return Math.min(MAX_QUERY_BATCH_SIZE, Math.max(MIN_QUERY_BATCH_SIZE, limit))
  }

  /**
   * A pager key scope for this connection: the org, and a fingerprint of the
   * connection's refresh token (`connectionScope`). The org alone is not
   * enough. Record visibility is per user (sharing rules, field-level
   * security), and the row pager holds the rows it fetched: keyed by org, a
   * second user's page 2 came out of the first user's batch with no request
   * under the second user's token. The access token is not used while there
   * is a refresh token, since it rotates with every refresh.
   */
  private scopeFor(credentials: Credentials): string {
    const url = credentials.extra?.['instanceUrl']
    return connectionScope(
      `salesforce:${typeof url === 'string' && url ? url : 'unknown'}`,
      credentials,
    )
  }

  /**
   * One batch of `soql`: the first when `nextRecordsUrl` is absent, else the
   * batch it names.
   *
   * The query carries `ORDER BY Id` for a deterministic walk and no `LIMIT`:
   * capping the SOQL itself would cap the TOTAL result set, not the size of
   * one batch. The batch size comes from `Sforce-Query-Options: batchSize`,
   * set on the FIRST request only — `queryNext` continues at whatever size
   * that request established, and Salesforce treats the size as a hint.
   */
  private async soqlBatch<T>(
    client: SalesforceClient,
    soql: string,
    batchSize: number,
    nextRecordsUrl: string | undefined,
  ): Promise<SoqlBatch<T>> {
    const res = nextRecordsUrl
      ? await client.queryNext<T>(nextRecordsUrl)
      : await client.query<T>(`${soql} ORDER BY Id`, batchSize)
    const next = !res.done && res.nextRecordsUrl ? res.nextRecordsUrl : undefined
    return { records: res.records ?? [], next }
  }

  /**
   * The caller's page of a SOQL list, cut from Salesforce's batches.
   *
   * SOQL `LIMIT/OFFSET` is out — OFFSET errors with NUMBER_OUTSIDE_VALID_RANGE
   * past 2,000 rows — so the list walks the `nextRecordsUrl` chain. A batch
   * is never smaller than 200 rows, so one batch is not one page: at
   * `limit=25`, serving a batch as a page handed the router 200 rows, it kept
   * 25, and the next page began at row 200 — 175 of every 200 rows were never
   * served. `pageByRows` cuts exactly rows [(page-1)×limit, page×limit) out of
   * the batches, reports `hasMore` exactly, and serves consecutive pages from
   * the batch it already holds: a walk costs one request per batch.
   *
   * Keyed by the batch size, not the caller's limit: positions in the chain
   * depend only on the batches, so walks at 25 and 50 share one.
   *
   * A remembered `nextRecordsUrl` is read again when a page is re-requested,
   * when a jump starts from a remembered batch, and when the slot's copy of a
   * batch is over a minute old. Salesforce's REST guide describes only
   * reading a locator forward and does not say whether a second read is
   * allowed (UNVERIFIED against a live org). So a locator Salesforce refuses
   * with INVALID_QUERY_LOCATOR restarts the walk from a fresh `query` within
   * the same call (`restartOn`) rather than failing the page. The cursor
   * limits are settled: since API 56.0 there is no cap on open cursors per
   * user, and a cursor lives two days (Salesforce Developer Limits and
   * Allocations Quick Reference, "API Query Cursor Limits"; this adapter
   * uses v60.0).
   */
  private async listSoqlRows<T>(
    credentials: Credentials,
    soql: string,
    params: QueryParams,
  ): Promise<PagedResult<T>> {
    const client = this.client(credentials)
    const batchSize = this.batchSize(params)
    const key = cursorPagerKey(this.scopeFor(credentials), soql, { batchSize })
    return pageByRows<T, string>(
      key,
      params,
      async (cursor) => {
        const batch = await this.soqlBatch<T>(client, soql, batchSize, cursor)
        return { items: batch.records, next: batch.next }
      },
      { defaultLimit: DEFAULT_LIST_LIMIT, restartOn: isExpiredLocator },
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.listSoqlRows<RawSalesforceContact>(
      credentials,
      CONTACT_SOQL,
      params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSalesforceContact>('Contact', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const { id } = await client.post('Contact', untransformContact(data))
    const raw = await client.get<RawSalesforceContact>('Contact', id)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = this.client(credentials)
    await client.patch('Contact', id, untransformContact(data))
    const raw = await client.get<RawSalesforceContact>('Contact', id)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contact', id)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.listSoqlRows<RawSalesforceAccount>(
      credentials,
      ACCOUNT_SOQL,
      params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSalesforceAccount>('Account', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const client = this.client(credentials)
    const { id } = await client.post('Account', untransformCompany(data))
    const raw = await client.get<RawSalesforceAccount>('Account', id)
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const client = this.client(credentials)
    await client.patch('Account', id, untransformCompany(data))
    const raw = await client.get<RawSalesforceAccount>('Account', id)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Account', id)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.listSoqlRows<RawSalesforceOpportunity>(
      credentials,
      OPPORTUNITY_SOQL,
      params,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSalesforceOpportunity>('Opportunity', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const client = this.client(credentials)
    const { id } = await client.post('Opportunity', untransformDeal(data))
    const raw = await client.get<RawSalesforceOpportunity>('Opportunity', id)
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const client = this.client(credentials)
    await client.patch('Opportunity', id, untransformDeal(data))
    const raw = await client.get<RawSalesforceOpportunity>('Opportunity', id)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Opportunity', id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * One pipeline synthesised from a describe call, so the whole collection
   * is page 1. `pageLocally` answers page 2 empty with an exact total, where
   * returning the pipeline for every page served it again on each one.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const described = await this.client(credentials).describe('Opportunity')
    const fields = described['fields'] as Array<{ name: string; picklistValues?: RawSalesforcePicklistValue[] }> | undefined
    const stageField = fields?.find((f) => f.name === 'StageName')
    const picklistValues = stageField?.picklistValues ?? []
    return pageLocally([transformPipeline(picklistValues)], params)
  }

  async getPipeline(credentials: Credentials, _id: string): Promise<Pipeline> {
    // Salesforce only has a single synthesised pipeline
    const [pipeline] = await this.listPipelines(credentials, {})
    return pipeline!
  }

  // ── Activities (Tasks + Events) ───────────────────────────────────────────

  /**
   * Task and Event are separate sObjects — SOQL has no UNION, so there is no
   * single query that returns both. The list is one stream: every Task batch,
   * then every Event batch, and `pageByRows` cuts the caller's pages out of
   * it like any SOQL list (see `listSoqlRows`). The cursor names the sObject
   * and the `nextRecordsUrl` within it; the last Task batch continues at the
   * first Event query.
   *
   * It used to be page N of Tasks concatenated with page N of Events: up to
   * twice the caller's limit on one page, so the router dropped the Events a
   * page carried and a sync counted two batches as one page.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const batchSize = this.batchSize(params)
    const key = cursorPagerKey(this.scopeFor(credentials), `${TASK_SOQL} + ${EVENT_SOQL}`, {
      batchSize,
    })
    const { items } = await pageByRows<ActivityRow, ActivityCursor>(
      key,
      params,
      async (at) => {
        if ((at?.obj ?? 'Task') === 'Task') {
          const batch = await this.soqlBatch<RawSalesforceTask>(client, TASK_SOQL, batchSize, at?.next)
          return {
            items: batch.records.map((raw) => ({ obj: 'Task' as const, raw })),
            next: batch.next ? { obj: 'Task', next: batch.next } : { obj: 'Event' },
          }
        }
        const batch = await this.soqlBatch<RawSalesforceEvent>(client, EVENT_SOQL, batchSize, at?.next)
        return {
          items: batch.records.map((raw) => ({ obj: 'Event' as const, raw })),
          next: batch.next ? { obj: 'Event', next: batch.next } : undefined,
        }
      },
      { defaultLimit: DEFAULT_LIST_LIMIT, restartOn: isExpiredLocator },
    )
    return items.map((row) =>
      row.obj === 'Task' ? transformActivity(row.raw) : transformEvent(row.raw),
    )
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const client = this.client(credentials)
    if (id.startsWith(EVENT_ID_PREFIX)) {
      return transformEvent(await client.get<RawSalesforceEvent>('Event', id))
    }
    return transformActivity(await client.get<RawSalesforceTask>('Task', id))
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const client = this.client(credentials)
    if (data.type === 'meeting') {
      const { id } = await client.post('Event', untransformEvent(data))
      return transformEvent(await client.get<RawSalesforceEvent>('Event', id))
    }
    const { id } = await client.post('Task', untransformActivity(data))
    return transformActivity(await client.get<RawSalesforceTask>('Task', id))
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const client = this.client(credentials)
    if (id.startsWith(EVENT_ID_PREFIX)) {
      await client.patch('Event', id, untransformEvent(data))
      return transformEvent(await client.get<RawSalesforceEvent>('Event', id))
    }
    await client.patch('Task', id, untransformActivity(data))
    return transformActivity(await client.get<RawSalesforceTask>('Task', id))
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    const sobject = id.startsWith(EVENT_ID_PREFIX) ? 'Event' : 'Task'
    await this.client(credentials).delete(sobject, id)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.listSoqlRows<RawSalesforceNote>(
      credentials,
      NOTE_SOQL,
      params,
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawSalesforceNote>('Note', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const client = this.client(credentials)
    const { id } = await client.post('Note', untransformNote(data))
    const raw = await client.get<RawSalesforceNote>('Note', id)
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const client = this.client(credentials)
    await client.patch('Note', id, untransformNote(data))
    const raw = await client.get<RawSalesforceNote>('Note', id)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Note', id)
  }
}
