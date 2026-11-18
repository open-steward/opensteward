/**
 * Papercups adapter for the customer-support vertical.
 *
 * Papercups is an open-source customer messaging platform.
 * Auth: Bearer API key (Authorization: Bearer <api_key>).
 * Base URL: https://app.papercups.io/api/v1
 *
 * Supported resources: conversations (tickets), messages, customers (contacts),
 * current user (users — /me only). Tags, teams, and macros are not exposed by
 * the Papercups public API and auto-501 via the unimplemented interface.
 *
 * Webhooks: challenge-response verification only (no HMAC signature).
 * Events: message:created, conversation:created, conversation:updated.
 *
 * Docs: https://docs.papercups.io/api-endpoints
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { PapercupsClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyPapercupsWebhook, parsePapercupsWebhookEvents } from './webhook'

import { transformTicket, type RawPapercupsConversation } from './transform/ticket'
import { transformMessage, type RawPapercupsMessage } from './transform/message'
import { transformContact, type RawPapercupsCustomer } from './transform/contact'
import { transformUser, type RawPapercupsUser } from './transform/user'

// ── API response envelope helpers ─────────────────────────────────────────────

interface DataListResponse<T> { data: T[] }
interface DataResponse<T>     { data: T }

// ── Adapter config ─────────────────────────────────────────────────────────────

// Papercups uses a static API key; no OAuth client credentials needed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PapercupsAdapterConfig {}

export class PapercupsAdapter implements CustomerSupportAdapter {
  readonly platform = 'papercups'
  readonly version = '0.1.0'

  constructor(_config?: PapercupsAdapterConfig) {}

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
    throw new Error('papercups uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPapercupsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePapercupsWebhookEvents(payload)
  }

  private client(credentials: Credentials): PapercupsClient {
    return new PapercupsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Tickets (conversations) ──────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<DataListResponse<RawPapercupsConversation>>(
      '/conversations',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<DataResponse<RawPapercupsConversation>>(
      `/conversations/${id}`,
    )
    return transformTicket(res.data)
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, conversationId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<DataListResponse<RawPapercupsMessage>>(
      '/messages',
      { ...this.listParams(params), conversation_id: conversationId },
    )
    return (res.data ?? []).map((m) => transformMessage(m, conversationId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const res = await this.client(credentials).get<DataResponse<RawPapercupsMessage>>(
      `/messages/${id}`,
    )
    const conversationId = res.data.conversation_id ? String(res.data.conversation_id) : ''
    return transformMessage(res.data, conversationId)
  }

  // ── Contacts (customers) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<DataListResponse<RawPapercupsCustomer>>(
      '/customers',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<DataResponse<RawPapercupsCustomer>>(
      `/customers/${id}`,
    )
    return transformContact(res.data)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────────
  // Papercups only exposes /me for the authenticated user; there is no list endpoint.

  async listUsers(credentials: Credentials, _params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<DataResponse<RawPapercupsUser>>('/me')
    return [transformUser(res.data)]
  }

  async getUser(credentials: Credentials, _id: string): Promise<User> {
    const res = await this.client(credentials).get<DataResponse<RawPapercupsUser>>('/me')
    return transformUser(res.data)
  }
}
