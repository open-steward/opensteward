/**
 * Five9 adapter — customer-support vertical.
 *
 * Five9 is a cloud contact center platform. This adapter targets the
 * Five9 SCIM 2.0 REST API (https://api.five9.com/scim/v2), which is
 * authenticated with a static Bearer token generated in the Five9 Admin
 * console (Admin > Identity > SCIM Settings).
 *
 * Supported resources (SCIM surface):
 *   - Contacts   → SCIM Users  (GET /Users)
 *   - Users      → SCIM Users  (GET /Users) — same endpoint, surfaced as agents
 *   - Teams      → SCIM Groups (GET /Groups)
 *
 * NOT supported (no public REST / SCIM endpoint available):
 *   - Tickets    — only accessible via SOAP Configuration API
 *   - Messages   — only accessible via SOAP Configuration API
 *   - Tags       — only accessible via SOAP Configuration API
 *   - Macros     — not a Five9 concept
 *   - Webhooks   — SCIM surface has no webhook delivery mechanism
 *
 * Auth model: api_key (SCIM Bearer token — long-lived, no OAuth exchange needed)
 * Schema-firewall: no attachment content, no voice recordings, no AI summaries,
 * contact PII limited to email + name + phone only.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { Five9Client } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformContact, type RawFive9ScimUser } from './transform/contact'
import { transformUser, type RawFive9ScimAgent } from './transform/user'
import { transformTeam, type RawFive9ScimGroup } from './transform/team'

/** SCIM ListResponse envelope (RFC 7644 §3.4.2) */
interface ScimListResponse<T> {
  totalResults?: number
  startIndex?: number
  itemsPerPage?: number
  Resources?: T[]
  schemas?: string[]
}

export class Five9Adapter implements CustomerSupportAdapter {
  readonly platform = 'five9'
  readonly version = '0.1.0'

  // No OAuth config required — auth is purely a static Bearer token
  constructor() {}

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
    throw new Error('five9 uses a static Bearer token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // SCIM tokens are long-lived and do not expire automatically
    return credentials
  }

  private client(credentials: Credentials): Five9Client {
    return new Five9Client(credentials)
  }

  /** Map QueryParams to SCIM pagination params (RFC 7644 §3.4.2.4) */
  private scimParams(params: QueryParams): Record<string, unknown> {
    const count = params.limit ?? DEFAULT_PAGE_SIZE
    const startIndex = params['cursor'] ? Number(params['cursor']) : 1
    return { startIndex, count }
  }

  // ── Contacts (SCIM Users) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<ScimListResponse<RawFive9ScimUser>>(
      '/Users',
      this.scimParams(params),
    )
    return (res.Resources ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFive9ScimUser>(`/Users/${encodeURIComponent(id)}`)
    return transformContact(raw)
  }

  // ── Users / Agents (SCIM Users) ───────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ScimListResponse<RawFive9ScimAgent>>(
      '/Users',
      this.scimParams(params),
    )
    return (res.Resources ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawFive9ScimAgent>(`/Users/${encodeURIComponent(id)}`)
    return transformUser(raw)
  }

  // ── Teams (SCIM Groups / skill-groups) ────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<ScimListResponse<RawFive9ScimGroup>>(
      '/Groups',
      this.scimParams(params),
    )
    return (res.Resources ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawFive9ScimGroup>(`/Groups/${encodeURIComponent(id)}`)
    return transformTeam(raw)
  }

  // ── Not supported on this platform ───────────────────────────────────────
  // listTickets, getTicket, listMessages, getMessage, listTags, getTag,
  // listMacros, getMacro, verifyWebhook, parseWebhookEvents
  // These methods are intentionally absent — the interface declares them all
  // optional, so callers receive HTTP 501 automatically.
}
