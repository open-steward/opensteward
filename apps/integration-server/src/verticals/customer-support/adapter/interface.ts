export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Ticket } from '../schema/ticket'
import type { Message } from '../schema/message'
import type { Contact } from '../schema/contact'
import type { User } from '../schema/user'
import type { Tag } from '../schema/tag'
import type { Team } from '../schema/team'
import type { Macro } from '../schema/macro'
import type { WebhookEvent } from '../schema/webhook'

/**
 * CustomerSupportAdapter — extends BaseAdapter with support resource methods.
 *
 * Read-only B2B. Schema-firewall: no attachment content, no voice recording
 * audio/transcripts, no AI-generated summaries, contact PII = email + name +
 * phone only.
 */
export interface CustomerSupportAdapter extends BaseAdapter {
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Tickets ──────────────────────────────────────────────────────────────
  listTickets?(credentials: Credentials, params: QueryParams): Promise<Ticket[]>
  getTicket?(credentials: Credentials, id: string): Promise<Ticket>

  // ── Messages (scoped to a ticket) ────────────────────────────────────────
  listMessages?(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]>
  getMessage?(credentials: Credentials, id: string): Promise<Message>

  // ── Contacts ─────────────────────────────────────────────────────────────
  listContacts?(credentials: Credentials, params: QueryParams): Promise<Contact[]>
  getContact?(credentials: Credentials, id: string): Promise<Contact>

  // ── Users (agents) ───────────────────────────────────────────────────────
  listUsers?(credentials: Credentials, params: QueryParams): Promise<User[]>
  getUser?(credentials: Credentials, id: string): Promise<User>

  // ── Tags ─────────────────────────────────────────────────────────────────
  listTags?(credentials: Credentials, params: QueryParams): Promise<Tag[]>
  getTag?(credentials: Credentials, id: string): Promise<Tag>

  // ── Teams ────────────────────────────────────────────────────────────────
  listTeams?(credentials: Credentials, params: QueryParams): Promise<Team[]>
  getTeam?(credentials: Credentials, id: string): Promise<Team>

  // ── Macros (canned responses; may return [] on platforms w/o feature) ────
  listMacros?(credentials: Credentials, params: QueryParams): Promise<Macro[]>
  getMacro?(credentials: Credentials, id: string): Promise<Macro>
}
