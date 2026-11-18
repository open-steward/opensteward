/**
 * Businessmap adapter for the projects vertical.
 *
 * Businessmap (formerly Kanbanize) is a Kanban/agile platform.
 * Auth: static API key, per-account subdomain URL.
 * API: https://{subdomain}.kanbanize.com/api/v2
 *
 * Mapping:
 *   Board      → Project
 *   Card       → Task
 *   Comment    → Comment
 *   Tag        → Tag
 *   Workspace  → Workspace
 *   User       → User
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { BusinessmapClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyBusinessmapWebhook, parseBusinessmapWebhookEvents } from './webhook'

import { transformProject, type RawBusinessmapBoard } from './transform/project'
import { transformTask, type RawBusinessmapCard } from './transform/task'
import { transformComment, type RawBusinessmapComment } from './transform/comment'
import { transformTag, type RawBusinessmapTag } from './transform/tag'
import { transformWorkspace, type RawBusinessmapWorkspace } from './transform/workspace'
import { transformUser, type RawBusinessmapUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BusinessmapAdapterConfig {}

/**
 * Businessmap API v2 list response.
 * Single-object endpoints return { data: <T> }.
 * List endpoints return { data: <T[]> } or { data: { data: <T[]>, pagination: {...} } }.
 * We normalise both shapes below.
 */
interface ApiListEnvelope<T> {
  data?: T[] | { data?: T[]; pagination?: unknown }
}

interface ApiSingleEnvelope<T> {
  data?: T
}

function extractList<T>(res: ApiListEnvelope<T>): T[] {
  if (!res.data) return []
  if (Array.isArray(res.data)) return res.data
  // Nested { data: { data: [...] } } shape
  const inner = (res.data as { data?: T[] }).data
  return Array.isArray(inner) ? inner : []
}

export class BusinessmapAdapter implements ProjectsAdapter {
  readonly platform = 'businessmap'
  readonly version = '0.1.0'

  constructor(_config: BusinessmapAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('businessmap uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBusinessmapWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBusinessmapWebhookEvents(payload)
  }

  private client(credentials: Credentials): BusinessmapClient {
    return new BusinessmapClient(credentials)
  }

  /** Build pagination query params: page + per_page */
  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Boards → Projects ──────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    const query: Record<string, unknown> = { ...this.pageParams(params) }
    if (workspaceId) query['workspace_id'] = workspaceId
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapBoard>>(
      '/boards',
      query,
    )
    return extractList(res).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ApiSingleEnvelope<RawBusinessmapBoard>>(
      `/boards/${id}`,
    )
    if (!res.data) throw new Error(`Businessmap board ${id} not found`)
    return transformProject(res.data)
  }

  // ── Cards → Tasks ──────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    boardId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapCard>>(
      '/cards',
      { board_ids: boardId, ...this.pageParams(params) },
    )
    return extractList(res).map((c) => transformTask(c, boardId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<ApiSingleEnvelope<RawBusinessmapCard>>(
      `/cards/${id}`,
    )
    if (!res.data) throw new Error(`Businessmap card ${id} not found`)
    return transformTask(res.data)
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    cardId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapComment>>(
      `/cards/${cardId}/comments`,
      this.pageParams(params),
    )
    return extractList(res).map((c) => transformComment(c, cardId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Businessmap does not expose a single-comment GET endpoint; we 501.
    throw new Error(`Businessmap: getComment(${id}) is not supported by the API`)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapTag>>(
      '/tags',
      this.pageParams(params),
    )
    return extractList(res).map((t) => transformTag(t, workspaceId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<ApiSingleEnvelope<RawBusinessmapTag>>(
      `/tags/${id}`,
    )
    if (!res.data) throw new Error(`Businessmap tag ${id} not found`)
    return transformTag(res.data)
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────

  async listWorkspaces(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapWorkspace>>(
      '/workspaces',
      this.pageParams(params),
    )
    return extractList(res).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<ApiSingleEnvelope<RawBusinessmapWorkspace>>(
      `/workspaces/${id}`,
    )
    if (!res.data) throw new Error(`Businessmap workspace ${id} not found`)
    return transformWorkspace(res.data)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<ApiListEnvelope<RawBusinessmapUser>>(
      '/users',
      this.pageParams(params),
    )
    return extractList(res).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<ApiSingleEnvelope<RawBusinessmapUser>>(
      `/users/${id}`,
    )
    if (!res.data) throw new Error(`Businessmap user ${id} not found`)
    return transformUser(res.data)
  }
}
