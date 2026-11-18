/**
 * Ada CX adapter — customer-support vertical.
 *
 * Ada is a conversational AI platform. Auth is an API key sent as
 * "Authorization: Bearer <token>", on a per-tenant host
 * https://<bot-handle>.ada.support (docs.ada.cx).
 *
 * Resources:
 *   - Tickets  → conversations: the Data Export API to list, the
 *                Conversations API to read one
 *   - Messages → the Conversations API's messages of one conversation
 *   - Contacts → the End Users API
 *
 * Not supported (no public Ada API):
 *   - Users (agents), Tags, Teams, Macros → auto-501 via interface optionality
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type CursorPage,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { AdaCxClient } from './client'
import {
  CONVERSATION_MESSAGES_MAX_LIMIT,
  CONVERSATIONS_PATH,
  END_USERS_PATH,
  EXPORT_CONVERSATIONS_PATH,
  EXPORT_PAGE_SIZE_MAX,
  EXPORT_PAGE_SIZE_MIN,
} from './constants'
import { exportWindows } from './windows'

import {
  transformConversation,
  transformExportConversation,
  type RawAdaConversation,
  type RawAdaExportConversation,
} from './transform/ticket'
import { transformMessage, type RawAdaMessageLog } from './transform/message'
import { transformContact, type RawAdaEndUser } from './transform/contact'

// Ada uses API key auth; no OAuth client credentials needed
export type AdaCxAdapterConfig = Record<string, never>

/** Data Export response: "`data` (list of Conversation)", "`meta.next_page_uri` (string, nullable)". */
interface ExportResponse<T> {
  data?: T[]
  meta?: { next_page_uri?: string | null }
}

/** Conversations / End Users list response: `data`, and "`meta.next_page_url`". */
interface CursorListResponse<T> {
  data?: T[]
  meta?: { next_page_url?: string | null }
}

/** Where the export walk is: which window, and Ada's link to the next page inside it. */
interface ExportCursor {
  window: number
  link?: string
}

/**
 * The `cursor` to send for the page after this one. Ada documents it as "the
 * value from `meta.next_page_url` in the previous response" and "also
 * provided in the `next_page_url`". A link with no `cursor` cannot be
 * continued, so it is an error rather than a silent end.
 */
function cursorFrom(nextPageUrl: string | null | undefined): string | undefined {
  if (!nextPageUrl) return undefined
  let cursor: string | null
  try {
    cursor = new URL(nextPageUrl).searchParams.get('cursor')
  } catch {
    throw new Error(`ada-cx: next_page_url is not a URL: ${nextPageUrl}`)
  }
  if (!cursor) throw new Error(`ada-cx: next_page_url carries no cursor: ${nextPageUrl}`)
  return cursor
}

export class AdaCxAdapter implements CustomerSupportAdapter {
  readonly platform = 'ada-cx'
  readonly version = '0.1.0'

  constructor(_config?: AdaCxAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('ada-cx uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): AdaCxClient {
    return new AdaCxClient(credentials)
  }

  // ── Tickets (Conversations) ───────────────────────────────────────────────

  /**
   * GET /api/v2/export/conversations, walked window by window (see
   * `windows.ts`), newest window first, following `meta.next_page_uri`
   * inside each. With `updatedAfter` the windows go in `updated_since` /
   * `updated_to`; without it, in `created_since` / `created_to` back to the
   * documented 12-month lookback. The two pairs "are mutually exclusive".
   *
   * `page_size` has a documented minimum of 100, above a small caller limit,
   * so pageByRows cuts the caller's exact rows out of the upstream pages.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const asked = typeof params.limit === 'number' && params.limit >= 1 ? params.limit : undefined
    const pageSize = Math.min(
      Math.max(asked ?? EXPORT_PAGE_SIZE_MIN, EXPORT_PAGE_SIZE_MIN),
      EXPORT_PAGE_SIZE_MAX,
    )
    const plan = exportWindows(new Date(), params.updatedAfter)
    const sinceKey = plan.mode === 'updated' ? 'updated_since' : 'created_since'
    const toKey = plan.mode === 'updated' ? 'updated_to' : 'created_to'
    const key = cursorPagerKey(
      connectionScope(client.botHandle, credentials),
      EXPORT_CONVERSATIONS_PATH,
      { mode: plan.mode, lower: plan.lower, anchor: plan.anchor, page_size: pageSize },
    )

    const fetchPage = async (
      at: ExportCursor | undefined,
    ): Promise<CursorPage<Ticket, ExportCursor>> => {
      const index = at?.window ?? 0
      const window = plan.windows[index]
      if (!window) return { items: [], next: undefined }
      const res = at?.link
        ? await client.getLink<ExportResponse<RawAdaExportConversation>>(at.link)
        : await client.get<ExportResponse<RawAdaExportConversation>>(EXPORT_CONVERSATIONS_PATH, {
            [sinceKey]: window.since,
            [toKey]: window.to,
            page_size: pageSize,
          })
      const link = res.meta?.next_page_uri
      const next: ExportCursor | undefined = link
        ? { window: index, link }
        : index + 1 < plan.windows.length
          ? { window: index + 1 }
          : undefined
      return { items: (res.data ?? []).map(transformExportConversation), next }
    }

    const result = await pageByRows<Ticket, ExportCursor>(key, params, fetchPage)
    return result.items
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawAdaConversation>(
      `${CONVERSATIONS_PATH}/${encodeURIComponent(id)}/`,
    )
    return transformConversation(res)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v2/conversations/{conversation_id}/messages/ with `limit` ("max
   * 100") and `cursor` ("Use the value from `meta.next_page_url` in the
   * previous response").
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const asked = typeof params.limit === 'number' && params.limit >= 1 ? params.limit : undefined
    const limit = Math.min(
      asked ?? CONVERSATION_MESSAGES_MAX_LIMIT,
      CONVERSATION_MESSAGES_MAX_LIMIT,
    )
    const path = `${CONVERSATIONS_PATH}/${encodeURIComponent(ticketId)}/messages/`
    const key = cursorPagerKey(connectionScope(client.botHandle, credentials), path, { limit })
    const result = await pageByCursor<Message, string>(key, params.page, async (cursor) => {
      const res = await client.get<CursorListResponse<RawAdaMessageLog>>(path, {
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      return {
        items: (res.data ?? []).map((m) => transformMessage(m, ticketId)),
        next: cursorFrom(res.meta?.next_page_url),
      }
    })
    reportUpstreamPage(params, {
      hasMore: result.hasMore,
      ...(asked !== undefined && limit < asked ? { pageSize: limit } : {}),
    })
    return result.items
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `ada-cx: messages are conversation-scoped; call listMessages(conversationId). id=${id}`,
    )
  }

  // ── Contacts (End Users) ──────────────────────────────────────────────────

  /**
   * GET /api/v2/end-users/ with `limit` ("The number of records to return",
   * no maximum documented) and `cursor` from `meta.next_page_url`.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const limit = typeof params.limit === 'number' && params.limit >= 1 ? params.limit : undefined
    const path = `${END_USERS_PATH}/`
    const key = cursorPagerKey(connectionScope(client.botHandle, credentials), path, { limit })
    const result = await pageByCursor<Contact, string>(key, params.page, async (cursor) => {
      const res = await client.get<CursorListResponse<RawAdaEndUser>>(path, {
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      })
      return {
        items: (res.data ?? []).map(transformContact),
        next: cursorFrom(res.meta?.next_page_url),
      }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawAdaEndUser>(
      `${END_USERS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }
}
