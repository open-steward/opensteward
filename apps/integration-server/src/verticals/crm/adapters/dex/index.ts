/**
 * Dex adapter for the CRM vertical.
 *
 * Maps the Dex REST API to canonical CRM resources.
 * Docs: https://getdex.com/docs/api-reference
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Reads: https://api.prod.getdex.com with "Authorization: Bearer dex_your_api_key"
 *   (https://getdex.com/docs/api-reference/authentication).
 *   credentials.accessToken = API key
 *   Writes still use the legacy Hasura host (see constants.ts); out of scope
 *   for the read rebuild.
 *
 * ── Paging ───────────────────────────────────────────────────────────────
 *   The list endpoints document: "Results are paginated. Use the `nextCursor`
 *   value from the response to fetch the next page. When `nextCursor` is null,
 *   you have reached the end of the list." (x-mint note on GET /v1/contacts/ in
 *   https://api.prod.getdex.com/docs/json). Contacts and reminders also take
 *   `take` + `skip`, so they page by offset; timeline documents no `skip`
 *   (only orderBy, take, include, select, cursor, contactId) and walks the
 *   cursor chain. No maximum `take` is documented (the spec's maximum is
 *   9007199254740991), so the caller's limit is sent as is.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (15):
 *   Contacts:   list, get, create, update, delete
 *   Notes:      list, get, create, update, delete
 *   Activities: list, get, create, update, delete  (mapped from Dex Reminders)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies  — Dex is a personal CRM; no company/organisation objects in the API
 *   Deals      — not supported in the Dex API
 *   Pipelines  — not supported in the Dex API
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: company   — Dex is a personal CRM; no company/organisation objects in the API
// Unavailable: deal      — Dex has no deal-tracking concept (personal CRM, no pipelines)
// Unavailable: pipeline  — Dex has no pipeline concept (personal CRM, no deal stages)

import {
  simpleApiKey,
  pageOffset,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'

import { DexClient } from './client'
import { transformContact, untransformContact, type RawDexContact } from './transform/contact'
import { transformNote, untransformNote, type RawDexNote } from './transform/note'
import { transformActivity, untransformActivity, type RawDexReminder } from './transform/activity'

/** The documented v1 list envelope: `{ error, data: { items, nextCursor } }`. */
interface V1List<R> {
  error: boolean
  data: { items: R[]; nextCursor?: string | null }
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'dex_...',
  helpText: 'Find your key in Dex → Settings → Workflow → Dex API & MCP.',
})

export class DexAdapter implements CrmAdapter {
  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dex'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Dex uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Passthrough: caller supplies the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): DexClient {
    return new DexClient(credentials)
  }

  /**
   * One caller page of an offset-paged v1 list (`take` + `skip`), with
   * `hasMore` from the documented end signal: `data.nextCursor` null.
   */
  private async offsetPage<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<R[]> {
    const take = params.limit ?? DEFAULT_PAGE_LIMIT
    const res = await this.client(credentials).getV1<V1List<R>>(path, {
      take,
      skip: pageOffset(params, take),
    })
    reportUpstreamPage(params, { hasMore: res.data.nextCursor != null })
    return res.data.items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // GET /v1/contacts/?take=&skip=  → { error, data: { items, nextCursor, count } }
  // https://getdex.com/docs/api-reference/reference/v1/contacts/list-contacts

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.offsetPage<RawDexContact>(credentials, '/v1/contacts/', params)
    return rows.map(transformContact)
  }

  // GET /v1/contacts/{contactId}  → { error, data: <contact> }
  // The spec marks this `data` as `"nullable": true`; a null body is a miss.
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).getV1<{ data: RawDexContact | null }>(
      `/v1/contacts/${encodeURIComponent(id)}`,
    )
    if (res.data === null || res.data === undefined) {
      throw Object.assign(new Error(`Dex contact ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawDexContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawDexContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // GET /v1/timeline/?take=&cursor=  → { error, data: { items, nextCursor, count } }
  // https://getdex.com/docs/api-reference/reference/v1/timeline/list-notes
  // No `skip` is documented here, so page N is reached through the cursor chain.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const take = params.limit ?? DEFAULT_PAGE_LIMIT
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('dex', credentials), 'notes', { take })
    const { items, hasMore } = await pageByCursor<RawDexNote>(key, params.page, async (cursor) => {
      const res = await client.getV1<V1List<RawDexNote>>('/v1/timeline/', { take, cursor })
      return { items: res.data.items, next: res.data.nextCursor ?? null }
    })
    reportUpstreamPage(params, { hasMore })
    return items.map(transformNote)
  }

  // GET /v1/timeline/{noteId}  → { error, data: { note: <note> } }
  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).getV1<{ data: { note: RawDexNote } }>(
      `/v1/timeline/${encodeURIComponent(id)}`,
    )
    return transformNote(res.data.note)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawDexNote>(
      '/timeline_items',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).put<RawDexNote>(`/timeline_items/${id}`, body)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/timeline_items/${id}`)
  }

  // ── Activities (Reminders) ────────────────────────────────────────────────
  // Dex Reminders map to canonical Activities.
  // GET /v1/reminders/?take=&skip=  → { error, data: { items, nextCursor } }
  // https://getdex.com/docs/api-reference/reference/v1/reminders/list-reminders

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.offsetPage<RawDexReminder>(credentials, '/v1/reminders/', params)
    return rows.map(transformActivity)
  }

  // GET /v1/reminders/{reminderId}  → { error, data: <reminder> }
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).getV1<{ data: RawDexReminder }>(
      `/v1/reminders/${encodeURIComponent(id)}`,
    )
    return transformActivity(res.data)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawDexReminder>(
      '/reminders',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawDexReminder>(
      `/reminders/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/reminders/${id}`)
  }
}
