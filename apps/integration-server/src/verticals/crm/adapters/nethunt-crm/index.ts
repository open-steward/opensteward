import {
  simpleApiKey,
  pageByCursor,
  pageByRows,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
/**
 * NetHunt CRM adapter for the CRM vertical.
 *
 * API: the NetHunt Public REST API (v2), https://nethunt.com/api/docs, whose
 * OpenAPI document is https://nethunt.com/api/openapi.json. It documents only
 * folders, folder fields, records and record timelines under /api/v2/folders.
 *
 * Auth: Bearer API key ("bearerFormat": "nh_live_*"), stored as accessToken.
 * Base URL: https://nethunt.com
 *
 * Data model: a workspace holds user-defined folders of records. A folder can
 * carry a system `role` — "enum": ["contact","company","deal","task"] —
 * and the docs say to "match by this value, not by folder name". So each
 * canonical resource reads the folder with that role:
 *   Contacts   → records of the `contact` folder
 *   Companies  → records of the `company` folder
 *   Deals      → records of the `deal` folder
 *   Activities → records of the `task` folder (the workspace's Tasks folder)
 *   Notes      → `comment` events of the timelines of contact, company and
 *                deal records (there is no workspace-wide comment list)
 *   Pipelines  → refused: the API has no pipeline resource.
 *
 * Lists page POST /api/v2/folders/{folderId}/records/filter with no filter,
 * whose `cursor`/`nextCursor` is "the way to export a whole folder page
 * by page (`limit` ≤ 1000 per page)".
 *
 * The write methods below predate this rebuild and still call paths the API
 * does not document; they are out of this rebuild's scope.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { NetHuntCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { MAX_PAGE_SIZE, NOTE_PARENT_PAGE_SIZE } from './constants'
import type { NetHuntFolder, NetHuntFolderRole, NetHuntRecord } from './types'
import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformActivity, untransformActivity, taskFieldIds } from './transform/activity'
import {
  transformNote,
  untransformNote,
  transformComment,
  type RawNetHuntNote,
  type NoteParentRole,
} from './transform/note'

// no OAuth config needed — API key auth
export type NetHuntCrmAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey({ placeholder: 'nh_live_…' })

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The order listNotes walks parent folders in. */
const NOTE_PARENT_ROLES: readonly NoteParentRole[] = ['contact', 'company', 'deal']

/** listNotes' upstream position: a parent folder role and a records/filter cursor in it. */
interface NoteCursor {
  role: NoteParentRole
  records?: string
}

export class NetHuntCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nethunt-crm'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: NetHuntCrmAdapterConfig = {}) {}

  // ── Auth (API Key stub) ───────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): NetHuntCrmClient {
    return new NetHuntCrmClient(credentials)
  }

  /**
   * The workspace's folder with `role`, from GET /api/v2/folders. Folder
   * names are user-editable, so the docs say to "match by this value, not by
   * folder name". None → `undefined`; more than one is ambiguous and throws.
   */
  private async findFolder(
    client: NetHuntCrmClient,
    role: NetHuntFolderRole,
  ): Promise<NetHuntFolder | undefined> {
    const matches = (await client.listFolders()).filter((f) => f.role === role)
    if (matches.length > 1) {
      throw Object.assign(
        new Error(`NetHunt CRM workspace has ${matches.length} folders with role "${role}"`),
        { statusCode: 409, code: 'AMBIGUOUS_FOLDER_ROLE' },
      )
    }
    return matches[0]
  }

  /** As {@link findFolder}, refusing when the workspace has no such folder. */
  private async folderFor(
    client: NetHuntCrmClient,
    role: NetHuntFolderRole,
  ): Promise<NetHuntFolder> {
    const folder = await this.findFolder(client, role)
    if (!folder) {
      throw notSupported(
        `NetHunt CRM workspace has no folder with role "${role}"; assign the role to a folder in NetHunt`,
      )
    }
    return folder
  }

  /**
   * One caller page of a folder's records: POST .../records/filter with no
   * filter and the default sort, carrying `nextCursor` forward. Upstream page
   * k IS caller page k at the size sent (the caller's limit, clamped to the
   * documented maximum of 1000).
   */
  private async pageRecords(
    client: NetHuntCrmClient,
    credentials: Credentials,
    folder: NetHuntFolder,
    params: QueryParams,
  ): Promise<NetHuntRecord[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const key = cursorPagerKey(
      connectionScope('nethunt-crm', credentials),
      `folders/${folder.id}/records/filter`,
      { limit },
    )
    let total: number | undefined
    const { items, hasMore } = await pageByCursor<NetHuntRecord>(
      key,
      params.page,
      async (cursor) => {
        const res = await client.filterRecords(folder.id, limit, cursor)
        // "`total` is returned only on the first page (request without `cursor`)"
        if (cursor === undefined && typeof res.total === 'number') total = res.total
        return { items: res.records, next: res.nextCursor }
      },
    )
    reportUpstreamPage(params, {
      hasMore,
      pageSize: limit,
      ...(total !== undefined ? { totalCount: total } : {}),
    })
    return items
  }

  private async listRole(
    credentials: Credentials,
    role: NetHuntFolderRole,
    params: QueryParams,
  ): Promise<NetHuntRecord[]> {
    const client = this.client(credentials)
    const folder = await this.folderFor(client, role)
    return this.pageRecords(client, credentials, folder, params)
  }

  private async getRole(
    credentials: Credentials,
    role: NetHuntFolderRole,
    id: string,
  ): Promise<NetHuntRecord> {
    const client = this.client(credentials)
    const folder = await this.folderFor(client, role)
    return client.getRecord(folder.id, id)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return (await this.listRole(credentials, 'contact', params)).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(await this.getRole(credentials, 'contact', id))
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<NetHuntRecord>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<NetHuntRecord>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return (await this.listRole(credentials, 'company', params)).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    return transformCompany(await this.getRole(credentials, 'company', id))
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<NetHuntRecord>('/organizations', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<NetHuntRecord>(`/organizations/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return (await this.listRole(credentials, 'deal', params)).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    return transformDeal(await this.getRole(credentials, 'deal', id))
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<NetHuntRecord>('/deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<NetHuntRecord>(`/deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * The Public REST API's paths are all under /api/v2/folders (folders,
   * fields, records, record timelines) and it has no pipeline or stage
   * resource; the v1 integration API likewise says only "We support listing
   * folders, creating, searching and updating records via our API."
   */
  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'NetHunt CRM cannot list pipelines: its Public REST API documents only folders, fields, records and record timelines, with no pipeline resource',
    )
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  /**
   * Records of the Tasks folder. Its role-bound fields (description,
   * completed, dueDate, assignee) have workspace-specific ids, read from
   * GET /api/v2/folders/{folderId}, which "Returns the folder with the full
   * `fields[]` schema".
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const folder = await this.folderFor(client, 'task')
    const ids = taskFieldIds((await client.getFolder(folder.id)).fields)
    const records = await this.pageRecords(client, credentials, folder, params)
    return records.map((r) => transformActivity(r, ids))
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const client = this.client(credentials)
    const folder = await this.folderFor(client, 'task')
    const ids = taskFieldIds((await client.getFolder(folder.id)).fields)
    return transformActivity(await client.getRecord(folder.id, id), ids)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<NetHuntRecord>('/activities', body)
    return transformActivity(res)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<NetHuntRecord>(`/activities/${id}`, body)
    return transformActivity(res)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  /**
   * Comments flattened out of record timelines. The API has no workspace-wide
   * comment list: comments are timeline events of one record, read with
   * GET .../records/{recordId}/timeline?types=comment. So the rows are walked
   * through pageByRows over upstream pages of PARENT records — the contact,
   * company and deal folders in turn, each paged by records/filter — and one
   * upstream page yields the comments of its parent records, each timeline
   * read to its end (`nextCursor` absent). A folder role the workspace has not
   * assigned contributes no comments.
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('nethunt-crm', credentials), 'notes', {
      parentLimit: NOTE_PARENT_PAGE_SIZE,
      timelineLimit: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<Note, NoteCursor>(key, params, async (cursor) => {
      const at: NoteCursor = cursor ?? { role: NOTE_PARENT_ROLES[0]! }
      const nextRole = NOTE_PARENT_ROLES[NOTE_PARENT_ROLES.indexOf(at.role) + 1]
      const afterFolder: NoteCursor | undefined = nextRole ? { role: nextRole } : undefined
      const folder = await this.findFolder(client, at.role)
      if (!folder) return { items: [], next: afterFolder }
      const parents = await client.filterRecords(folder.id, NOTE_PARENT_PAGE_SIZE, at.records)
      const rows: Note[] = []
      for (const record of parents.records) {
        let timelineCursor: string | undefined
        do {
          const page = await client.commentTimeline(
            folder.id,
            record.id,
            MAX_PAGE_SIZE,
            timelineCursor,
          )
          for (const event of page.events) {
            if (event.type !== 'comment') continue
            rows.push(transformComment(event, { role: at.role, recordId: record.id }))
          }
          timelineCursor = page.nextCursor
        } while (timelineCursor !== undefined)
      }
      return {
        items: rows,
        next:
          parents.nextCursor !== undefined
            ? { role: at.role, records: parents.nextCursor }
            : afterFolder,
      }
    })
    return items
  }

  /**
   * A comment is addressed only under its record: the one read-by-id path is
   * GET /api/v2/folders/{folderId}/records/{recordId}/timeline/{timelineId}/content,
   * and a canonical note id carries neither the folder nor the record.
   */
  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'NetHunt CRM cannot get a note by id: comments are read only under their record (GET /api/v2/folders/{folderId}/records/{recordId}/timeline)',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawNetHuntNote>('/notes', body)
    return transformNote(res)
  }
}
