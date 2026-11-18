/**
 * Respond.io adapter for the CRM vertical.
 *
 * Maps the Respond.io REST API v2 to canonical CRM resources.
 * Docs: https://developers.respond.io/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Bearer token passed as Authorization header on every request.
 *   credentials.accessToken = API access token (generated in
 *     Workspace Settings > Integrations > Developer API)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (5):
 *   Contacts: list, get, create, update, delete
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes, Activities
 *   (not exposed as standalone resources in Respond.io's v2 REST API)
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { RespondIoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawRespondIoContact } from './transform/contact'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API Access Token',
  helpText: 'Generated in Workspace Settings → Integrations → Developer API → Add Access Token.',
})

export class RespondIoAdapter implements CrmAdapter {
  // Connect Link support — single API-token form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'respond-io'
  readonly version = '0.1.0'
  /** POST /contact/list `limit` is documented "< 100" (exclusiveMaximum 100). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Respond.io uses a static API token, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API token directly as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static access tokens do not expire — return as-is.
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

  private client(credentials: Credentials): RespondIoClient {
    return new RespondIoClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // Documented contact routes (https://developers.respond.io/, Contact service):
  //   POST /contact/list (list), GET/POST/PUT/DELETE /contact/{identifier},
  //   where {identifier} is "Identifier of the contact that can either be a
  //   phone number, email or contact ID. Examples: ``id:123`` ,
  //   ``email:abdc@gmail.com`` , ``phone:+60121233112``".

  /**
   * One caller page of contacts from POST /contact/list
   * (https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts).
   *
   * The list pages by `cursorId` — "Pointer to the contact `id` from where
   * the next batch of records should start from." — which each response
   * hands back inside the `pagination.next` URL (example
   * "https://api.respond.io/contact/list?limit=10&cursorId=-10"). The cursor
   * is read out of that URL and passed through unchanged; the URL itself is
   * not followed, since the example drops the /v2 prefix. The 1-based `page`
   * is walked with pageByCursor, and an empty `next` is the end.
   *
   * The body is the docs' "All Contact(s)" example without its optional
   * `timezone`: `{"search":"","filter":{"$and":[]}}`. `limit` is clamped to
   * the documented "< 100" and the clamped size reported.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)

    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('respond-io', credentials), 'contact/list', {
      limit,
    })
    const { items, hasMore } = await pageByCursor<RawRespondIoContact>(
      key,
      params.page,
      async (cursorId) => {
        const res = await client.listContacts<RawRespondIoContact>(
          { limit, cursorId },
          { search: '', filter: { $and: [] } },
        )
        return { items: res.items, next: nextCursorId(res.pagination?.next) }
      },
    )
    reportUpstreamPage(params, { hasMore, ...(limit < asked ? { pageSize: limit } : {}) })
    return items.map(transformContact)
  }

  /** GET /contact/{identifier} with the documented `id:` form; the body is the Contact. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawRespondIoContact>(
      `/contact/id:${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<{ data: RawRespondIoContact }>('/contact', body)
    const created = raw?.data ?? (raw as unknown as RawRespondIoContact)
    if (!created || !created.id) {
      throw new Error('Respond.io: contact creation returned no data')
    }
    return transformContact(created)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<{ data: RawRespondIoContact }>(
      `/contact/${id}`,
      body,
    )
    const updated = raw?.data ?? (raw as unknown as RawRespondIoContact)
    if (!updated || !updated.id) {
      throw new Error(`Respond.io: contact update for ${id} returned no data`)
    }
    return transformContact(updated)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contact/${id}`)
  }
}

/**
 * The `cursorId` inside a `pagination.next` URL, or undefined when `next` is
 * empty (the last page). A non-empty `next` without a cursorId cannot be
 * followed, and treating it as the end would mark a truncated collection
 * complete, so it throws.
 */
function nextCursorId(next: string | null | undefined): string | undefined {
  if (!next) return undefined
  let cursorId: string | null
  try {
    cursorId = new URL(next).searchParams.get('cursorId')
  } catch {
    cursorId = null
  }
  if (!cursorId) {
    throw new Error(`Respond.io: pagination.next carries no cursorId: ${next}`)
  }
  return cursorId
}
