import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * Mixmax adapter for the CRM vertical.
 *
 * Maps the Mixmax REST API v1 to canonical CRM resources.
 * Docs: https://developer.mixmax.com/reference/getting-started-with-the-api
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API-key auth: every request sends the token via the `X-API-Token` header.
 *   Tokens are generated in Settings > Integrations > API.
 *   credentials.accessToken = API token
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts:   list, get, create, update, delete
 *   Notes:      list (per contact), create (per contact)
 *   Activities: list (sequence recipients), mapped from /v1/sequences/:id/recipients
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: company   — Mixmax REST API v1 has no companies endpoint; no organisation/account concept
 * Unavailable: deal      — Mixmax REST API v1 has no deals endpoint; deal tracking is not part of the product
 * Unavailable: pipeline  — Mixmax REST API v1 has no pipelines endpoint; pipeline management is not part of the product
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { MixmaxClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawMixmaxContact,
} from './transform/contact'
import {
  transformNote,
  untransformNote,
  type RawMixmaxNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'Your Mixmax API token',
  helpText: 'Find it in Mixmax Settings > Integrations > API.',
})

export class MixmaxAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'mixmax'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Mixmax uses API-key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the raw API token as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): MixmaxClient {
    return new MixmaxClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // GET /v1/contacts — cursor-paginated list; search via ?search query param.

  /**
   * One caller page of contacts. Mixmax pages by cursor ("The next page can be
   * fetched by passing `?next=<value>` on the querystring of the next
   * request"), so the 1-based `page` is walked with pageByCursor. Every
   * response carries a `next`, and only `hasNext` says it leads to more
   * rows ("If this is set to `false` you can still query the next page to pick
   * up results that were added after the first query was run"), so a `next`
   * is followed only when `hasNext` is true.
   *
   * `limit` is clamped to the documented upper limit ("Defaults to 50. The
   * upper limit is usually 300"), and the clamped size is reported so the
   * caller pages in units of what was sent. Not declared as
   * capabilities.maxPageSize: listNotes does not page yet.
   * https://developer.mixmax.com/reference/getting-started-with-the-api
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const search = params['search'] as string | undefined

    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('mixmax', credentials), 'contacts', {
      search,
      limit,
    })
    const { items, hasMore } = await pageByCursor<RawMixmaxContact>(
      key,
      params.page,
      async (cursor) => {
        const queryParams: Record<string, unknown> = { limit }
        if (cursor) queryParams['next'] = cursor
        if (search) queryParams['search'] = search
        const res = await client.list<RawMixmaxContact>('/contacts', queryParams)
        return { items: res.items, next: res.hasMore && res.nextCursor ? res.nextCursor : undefined }
      },
    )
    reportUpstreamPage(params, { hasMore, ...(limit < asked ? { pageSize: limit } : {}) })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawMixmaxContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // POST /v1/contacts accepts an array; returns array of created contacts.
    const created = await this.client(credentials).post<RawMixmaxContact[] | RawMixmaxContact>(
      '/contacts',
      [body],
    )
    const record = Array.isArray(created) ? created[0] : created
    if (!record) throw new Error('Mixmax: contact creation returned no data')
    return transformContact(record)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<RawMixmaxContact>(`/contacts/${id}`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  // GET /v1/contacts/:id/notes — notes are scoped to a contact.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id'] as string | undefined
    if (!contactId) return []
    const { items } = await this.client(credentials).list<RawMixmaxNote>(
      `/contacts/${contactId}/notes`,
      { limit: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    return items.map((n) => transformNote({ ...n, contactId }))
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const contactId = data.contact_id
    if (!contactId) throw new Error('Mixmax: contact_id is required to create a note')
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawMixmaxNote>(
      `/contacts/${contactId}/notes`,
      body,
    )
    return transformNote({ ...raw, contactId })
  }
}
