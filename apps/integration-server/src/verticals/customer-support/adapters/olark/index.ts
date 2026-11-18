/**
 * Olark adapter — customer-support vertical.
 *
 * Olark exposes a REST API at https://www.olark.com/api/v1 covering:
 *   - Operators (agents)  → listUsers / getUser
 *   - Groups (teams)      → listTeams / getTeam
 *
 * Tickets, contacts, messages, tags, and macros are not available via the
 * Olark REST API and are therefore not implemented (auto-501 from BaseAdapter).
 *
 * Auth: API key appended as `apikey` query parameter on every request.
 * Pagination: integer `page` offset, max 100 records per page.
 *
 * Webhook support: Olark sends conversation lifecycle events via HTTP POST
 * but does not document an HMAC signature scheme, so verifyWebhook is not
 * implemented.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { OlarkClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformUser, type RawOlarkOperator } from './transform/user'
import { transformTeam, type RawOlarkGroup } from './transform/team'

// Olark returns operator lists as a plain array under the `operators` key
interface OperatorsResponse { operators?: RawOlarkOperator[] }
interface OperatorResponse  { operator?: RawOlarkOperator }
interface GroupsResponse    { groups?: RawOlarkGroup[] }
interface GroupResponse     { group?: RawOlarkGroup }

export class OlarkAdapter implements CustomerSupportAdapter {
  readonly platform = 'olark'
  readonly version = '0.1.0'

   
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
    throw new Error('olark uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): OlarkClient {
    return new OlarkClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] !== undefined ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Users (operators / agents) ────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<OperatorsResponse>('/operators', this.listParams(params))
    return (res.operators ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<OperatorResponse>(`/operators/${id}`)
    if (!res.operator) throw new Error(`Olark operator ${id} not found`)
    return transformUser(res.operator)
  }

  // ── Teams (groups) ────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>('/groups', this.listParams(params))
    return (res.groups ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/groups/${id}`)
    if (!res.group) throw new Error(`Olark group ${id} not found`)
    return transformTeam(res.group)
  }
}
