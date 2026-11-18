/**
 * Haptik adapter — customer-support vertical.
 *
 * Haptik is a chatbot / Intelligent Virtual Assistant platform (Jio Haptik).
 *
 * Auth: Bearer token + client-id header (static credentials, no OAuth flow).
 *       All three credentials (apiToken, clientId, baseUrl) are tenant-specific:
 *       "The base-url will be provided by Haptik at the time of integration."
 *
 * The Conversation Studio API reference
 * (https://docs.haptik.ai/en_US/developer-guides/what-are-the-different-apis-that-can-be-used-on-conversation-studio)
 * documents "Move a chat to pending", "Get Chat Transcripts v2.0" and the FAQ
 * step (KMS) APIs. None of the 613 pages on docs.haptik.ai documents a way to
 * list conversations, agents or teams, or to read one by id, so those methods
 * refuse with 501 before sending anything.
 *
 * Resources:
 *   chat transcript → messages  (GET /integration/external/v2.0/get_chat_history/)
 *   end-users       → contacts  (POST /v1.0/user/)
 *
 * A conversation is identified by the transcript's documented "Group 1"
 * parameters, so its canonical ticket id is
 * `<business_id>:<user_name>:<conversation_no>`. Haptik's webhook payloads
 * carry all three (`business_id`, `user.user_name`, `conversation_no`).
 *
 * No webhook signature verification is documented by Haptik; verifyWebhook
 * and parseWebhookEvents are not implemented.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { HaptikClient } from './client'
import { EXTERNAL_V2_PATH, BOT_API_V1_PATH } from './constants'

import { transformMessage, type RawHaptikMessage } from './transform/message'
import { transformContact, type RawHaptikUser } from './transform/contact'

// ── Wire-format response shapes ───────────────────────────────────────────────

/** Documented JSON response of get_chat_history, and its documented error shape. */
interface ChatHistoryResponse {
  chat_json?: RawHaptikMessage[]
  error_message?: string
}

interface UserResponse {
  auth_id?: string
  name?: string | null
  email?: string | null
  mobile_no?: string | null
  language_code?: string | null
  device_platform?: string | null
  [key: string]: unknown
}

// ── Refusals ─────────────────────────────────────────────────────────────────

const API_SCOPE =
  'the Haptik API reference documents only "Move a chat to pending", "Get Chat Transcripts v2.0" and the FAQ step creation APIs'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The documented "Group 1" transcript parameters, carried in the ticket id. */
export interface HaptikConversationRef {
  businessId: string
  userName: string
  conversationNo: string
}

/**
 * Split a `<business_id>:<user_name>:<conversation_no>` ticket id.
 * business_id and conversation_no are documented as integers, so they sit at
 * the ends and the user name is everything between them.
 */
export function parseConversationRef(ticketId: string): HaptikConversationRef | undefined {
  const first = ticketId.indexOf(':')
  const last = ticketId.lastIndexOf(':')
  if (first < 0 || last <= first) return undefined
  const businessId = ticketId.slice(0, first)
  const userName = ticketId.slice(first + 1, last)
  const conversationNo = ticketId.slice(last + 1)
  if (!/^\d+$/.test(businessId) || !/^\d+$/.test(conversationNo) || userName === '')
    return undefined
  return { businessId, userName, conversationNo }
}

// ── Adapter config ─────────────────────────────────────────────────────────────

export interface HaptikAdapterConfig {
  /** Not used at runtime — Haptik credentials are fully provided by credentialFields(). */
  _placeholder?: never
}

// ── Adapter class ──────────────────────────────────────────────────────────────

export class HaptikAdapter implements CustomerSupportAdapter {
  readonly platform = 'haptik'
  readonly version = '0.1.0'

  constructor(_config?: HaptikAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('haptik uses static API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static tokens — no refresh needed
    return credentials
  }

  private client(credentials: Credentials): HaptikClient {
    return new HaptikClient(credentials)
  }

  // ── Tickets (conversations) ─────────────────────────────────────────────────

  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported(`Haptik cannot list conversations: ${API_SCOPE}; none lists conversations`)
  }

  async getTicket(_credentials: Credentials, _id: string): Promise<Ticket> {
    throw notSupported(
      `Haptik cannot read a conversation: ${API_SCOPE}; none returns a conversation's status or metadata`,
    )
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  /**
   * GET /integration/external/v2.0/get_chat_history/ with the documented
   * Group 1 arguments ("All arguments within a group are required"):
   * business_id, user_name and conversation_no, taken from the ticket id.
   *
   * The only other parameter, `limit`, is documented as "Limit on number of
   * messages that the API should return" — a cap with no offset or cursor —
   * so it is not sent: the whole transcript comes back and is paged locally.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const ref = parseConversationRef(ticketId)
    if (!ref) {
      throw notSupported(
        `Haptik cannot list messages for conversation "${ticketId}": get_chat_history requires business_id, ` +
          'user_name and conversation_no ("All arguments within a group are required"); ' +
          'pass the ticket id as <business_id>:<user_name>:<conversation_no>',
      )
    }
    const res = await this.client(credentials).get<ChatHistoryResponse>(
      `${EXTERNAL_V2_PATH}/get_chat_history/`,
      {
        business_id: ref.businessId,
        user_name: ref.userName,
        conversation_no: ref.conversationNo,
        response_type: 'json',
      },
    )
    if (!Array.isArray(res.chat_json)) {
      throw new Error(
        `Haptik get_chat_history returned no chat_json: ${res.error_message ?? 'unexpected response'}`,
      )
    }
    const messages = res.chat_json.map((m) => transformMessage(m, ticketId, ref.userName))
    return pageLocally(messages, params)
  }

  /**
   * Haptik messages are scoped to a conversation; there is no per-message
   * lookup endpoint. Use listMessages(ticketId) instead.
   */
  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Haptik messages are conversation-scoped; call listMessages(conversationNumber). id=${id}`,
    )
  }

  // ── Contacts (end-users) ────────────────────────────────────────────────────

  /**
   * Look up a Haptik end-user by auth_id.
   * Uses POST /v1.0/user/ with the auth_id field (Haptik user lookup is POST).
   */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).post<UserResponse>(`${BOT_API_V1_PATH}/user/`, {
      auth_id: id,
    })
    const raw: RawHaptikUser = {
      auth_id: res.auth_id ?? id,
      name: res.name,
      email: res.email,
      mobile_no: res.mobile_no,
      language_code: res.language_code,
      device_platform: res.device_platform,
    }
    return transformContact(raw)
  }

  /**
   * Haptik does not expose a paginated list-contacts endpoint in its external
   * REST API. Only individual lookup by auth_id is supported via getContact().
   */
  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    // Haptik has no REST endpoint for listing all end-users
    return []
  }

  // ── Users (agents) ──────────────────────────────────────────────────────────

  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    throw notSupported(`Haptik cannot list agents: ${API_SCOPE}; none lists agents`)
  }

  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    throw notSupported(`Haptik cannot read an agent: ${API_SCOPE}; none reads an agent`)
  }

  // ── Teams ────────────────────────────────────────────────────────────────────

  async listTeams(_credentials: Credentials, _params: QueryParams): Promise<Team[]> {
    throw notSupported(
      `Haptik cannot list teams: ${API_SCOPE}; a team_name "Can be fetched from the Teams page of Agent Chat Tool", not the API`,
    )
  }

  async getTeam(_credentials: Credentials, _id: string): Promise<Team> {
    throw notSupported(`Haptik cannot read a team: ${API_SCOPE}; none reads a team`)
  }
}
