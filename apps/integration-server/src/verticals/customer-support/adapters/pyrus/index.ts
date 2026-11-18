/**
 * Pyrus adapter for the customer-support vertical.
 *
 * Pyrus is a workflow/task management platform. Auth uses an API key
 * (login + security_key) exchanged for a bearer access_token via
 * https://accounts.pyrus.com/api/v4/auth.
 *
 * Supported resources:
 *   - Tickets  → Pyrus tasks (GET /tasks/{id}, GET /inbox)
 *   - Messages → Task comments (nested in GET /tasks/{id} response)
 *   - Contacts → Pyrus persons (GET /contacts)
 *   - Users    → Pyrus members (GET /members, GET /members/{id})
 *   - Teams    → Pyrus roles (GET /contacts → organization.roles)
 *
 * Not supported (no equivalent in Pyrus API):
 *   - Tags     → Pyrus has no task-tag concept
 *   - Macros   → Pyrus has no canned-responses concept
 *
 * Schema-firewall: no attachment content, no voice-recording bytes.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  refreshCredentials as adapterRefreshCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { PyrusClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyPyrusWebhook, parsePyrusWebhookEvents } from './webhook'

import { transformTicket, type RawPyrusTask } from './transform/ticket'
import { transformMessage, type RawPyrusCommentMessage } from './transform/message'
import { transformContact, type RawPyrusPerson } from './transform/contact'
import { transformUser, type RawPyrusMember } from './transform/user'
import { transformTeam, type RawPyrusRole } from './transform/team'

// ── Response shape interfaces ────────────────────────────────────────────────

interface TaskResponse {
  task?: RawPyrusTask
}

interface InboxResponse {
  tasks?: RawPyrusTask[]
  has_more?: boolean
}

interface MembersResponse {
  members?: RawPyrusMember[]
}

interface MemberResponse {
  id?: number
  first_name?: string
  last_name?: string
  email?: string
  position?: string
  status?: string
  banned?: boolean
  type?: string
  [key: string]: unknown
}

interface ContactsResponse {
  organizations?: Array<{
    organization_id?: number
    name?: string
    persons?: RawPyrusPerson[]
    roles?: RawPyrusRole[]
  }>
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class PyrusAdapter implements CustomerSupportAdapter {
  readonly platform = 'pyrus'
  readonly version = '0.1.0'

  // No OAuth config needed — Pyrus uses API key auth
  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('pyrus uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return adapterRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPyrusWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePyrusWebhookEvents(payload)
  }

  private client(credentials: Credentials): PyrusClient {
    return new PyrusClient(credentials)
  }

  // ── Tickets (Pyrus tasks via inbox) ─────────────────────────────────────

  /**
   * GET /inbox documents only `item_count` ("The maximum number of tasks in the
   * response") and answers `has_more`; it has no offset, page or cursor. So page
   * k asks for the first k × limit tasks and keeps the last `limit` of them, and
   * `has_more` says whether any exist beyond. https://pyrus.com/en/help/api/lists
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const start = pageOffset(params, limit)
    const itemCount = start + limit
    const res = await this.client(credentials).get<InboxResponse>('/inbox', {
      item_count: itemCount,
    })
    const tasks = res.tasks ?? []
    if (res.has_more === true && tasks.length <= start) {
      // The inbox says more exist but returned fewer than asked for: it capped
      // item_count, and rows past that cap are unreachable through /inbox.
      throw new Error(
        `Pyrus /inbox returned ${tasks.length} tasks for item_count=${itemCount} with has_more; page ${params.page ?? 1} is past what it serves`,
      )
    }
    reportUpstreamPage(params, { hasMore: res.has_more === true || tasks.length > itemCount })
    return tasks.slice(start, itemCount).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TaskResponse>(`/tasks/${id}`)
    if (!res.task) throw new Error(`Pyrus task ${id} not found`)
    return transformTicket(res.task)
  }

  // ── Messages (task comments, nested in task response) ───────────────────

  // GET /tasks/{id} returns the task "with all comments": the whole collection.
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<TaskResponse>(`/tasks/${ticketId}`)
    const comments = (res.task?.comments ?? []) as RawPyrusCommentMessage[]
    return pageLocally(comments, params).map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    // Pyrus comments are task-scoped; individual comment fetch is not available
    throw new Error(`Pyrus comments are task-scoped; call listMessages(taskId). id=${id}`)
  }

  // ── Contacts (Pyrus persons) ─────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const includeInactive = params['includeInactive'] === true || params['includeInactive'] === 'true'
    const res = await this.client(credentials).get<ContactsResponse>('/contacts', {
      ...(includeInactive ? { include_inactive: true } : {}),
    })
    const persons: (RawPyrusPerson & { organization_id?: number })[] = []
    for (const org of res.organizations ?? []) {
      for (const p of org.persons ?? []) {
        persons.push({ ...p, organization_id: org.organization_id })
      }
    }
    // GET /contacts is unpaginated: every contact, grouped by organization.
    return pageLocally(persons, params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // Pyrus has no single-person GET; scan contacts
    const res = await this.client(credentials).get<ContactsResponse>('/contacts')
    for (const org of res.organizations ?? []) {
      const person = (org.persons ?? []).find((p) => String(p.id) === id)
      if (person) {
        return transformContact({ ...person, organization_id: org.organization_id })
      }
    }
    throw new Error(`Pyrus contact ${id} not found`)
  }

  // ── Users (Pyrus members / agents) ──────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // GET /members "returns a list of all organization participants": unpaginated.
    const res = await this.client(credentials).get<MembersResponse>('/members')
    return pageLocally(res.members ?? [], params).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<MemberResponse>(`/members/${id}`)
    if (!res.id) throw new Error(`Pyrus member ${id} not found`)
    return transformUser(res as RawPyrusMember)
  }

  // ── Teams (Pyrus roles) ──────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<ContactsResponse>('/contacts')
    const roles: RawPyrusRole[] = []
    for (const org of res.organizations ?? []) {
      for (const r of org.roles ?? []) {
        roles.push(r)
      }
    }
    // Roles come from the unpaginated GET /contacts response.
    return pageLocally(roles, params).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<ContactsResponse>('/contacts')
    for (const org of res.organizations ?? []) {
      const role = (org.roles ?? []).find((r) => String(r.id) === id)
      if (role) return transformTeam(role)
    }
    throw new Error(`Pyrus role/team ${id} not found`)
  }

  // Tags and Macros are not implemented — Pyrus has no equivalent concepts.
  // The interface methods are intentionally omitted so the framework returns 501.
}
