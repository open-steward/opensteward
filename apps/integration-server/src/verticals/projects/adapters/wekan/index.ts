/**
 * Wekan adapter — projects vertical.
 *
 * Wekan is a self-hosted open-source kanban board.
 * REST API: https://wekan.fi/api/v7.92/
 *
 * Model mapping
 *   Board   → Project
 *   Card    → Task      (fetched per-list; id encoded as boardId:listId:cardId)
 *   Comment → Comment   (id encoded as boardId:cardId when passed as taskId)
 *   Label   → Tag       (embedded on board; id encoded as boardId:labelId)
 *   Virtual → Workspace (Wekan has no workspace object)
 *   User    → User
 *
 * Composite ID convention
 *   Task    id : "boardId:listId:cardId"
 *   Comment taskId : "boardId:cardId"
 *   Tag     id : "boardId:labelId"
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { WekanClient } from './client'
import { VIRTUAL_WORKSPACE_ID } from './constants'

import { transformProject, type RawWekanBoard } from './transform/project'
import { transformCard, type RawWekanCard } from './transform/task'
import { transformComment, type RawWekanComment } from './transform/comment'
import { transformLabel, type RawWekanLabel } from './transform/tag'
import { transformWorkspace, buildVirtualWorkspace } from './transform/workspace'
import { transformUser, type RawWekanUser } from './transform/user'

export interface WekanAdapterConfig {
  // Wekan is self-hosted; no OAuth client credentials are needed.
  // Configuration is entirely driven by the per-credential serverUrl.
  _placeholder?: never
}

interface RawWekanList {
  _id: string
  title?: string
  boardId?: string
  archived?: boolean
  [key: string]: unknown
}

/** Decode a composite "boardId:listId:cardId" task id. */
function decodeTaskId(id: string): { boardId: string; listId: string; cardId: string } {
  const parts = id.split(':')
  if (parts.length >= 3) {
    return { boardId: parts[0], listId: parts[1], cardId: parts.slice(2).join(':') }
  }
  // Fallback: treat entire string as cardId (best-effort)
  return { boardId: '', listId: '', cardId: id }
}

/** Decode a composite "boardId:cardId" comment task-id. */
function decodeCommentTaskId(taskId: string): { boardId: string; cardId: string } {
  const idx = taskId.indexOf(':')
  if (idx > 0) {
    return { boardId: taskId.slice(0, idx), cardId: taskId.slice(idx + 1) }
  }
  return { boardId: '', cardId: taskId }
}

/** Decode a composite "boardId:labelId" tag id. */
function decodeTagId(id: string): { boardId: string; labelId: string } {
  const idx = id.indexOf(':')
  if (idx > 0) {
    return { boardId: id.slice(0, idx), labelId: id.slice(idx + 1) }
  }
  return { boardId: '', labelId: id }
}

export class WekanAdapter implements ProjectsAdapter {
  readonly platform = 'wekan'
  readonly version = '0.1.0'

  constructor(_config?: WekanAdapterConfig) {}

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
    throw new Error('wekan uses username/password or static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens obtained via /users/login expire per tokenExpires.
    // Static tokens never expire. No refresh endpoint is documented.
    return credentials
  }

  private client(credentials: Credentials): WekanClient {
    return new WekanClient(credentials)
  }

  // ── Projects (Boards) ──────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const userId = client.userId
    if (!userId) throw new Error('wekan: userId is required in credentials.extra to list boards')
    const boards = await client.get<RawWekanBoard[]>(`/users/${userId}/boards`)
    // Documented with no query parameter: every board comes back, so page locally.
    return pageLocally((Array.isArray(boards) ? boards : []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // Wekan's export endpoint returns the full board object.
    const board = await this.client(credentials).get<RawWekanBoard>(`/boards/${id}/export`)
    if (!board || !board._id) throw new Error(`wekan: board ${id} not found`)
    return transformProject(board)
  }

  // ── Tasks (Cards) ──────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const client = this.client(credentials)
    // Fetch all lists for the board, then fetch cards in each list.
    const lists = await client.get<RawWekanList[]>(`/boards/${projectId}/lists`)
    if (!Array.isArray(lists)) return pageLocally([], params)
    const activeLists = lists.filter((l) => !l.archived)
    const cardArrays = await Promise.all(
      activeLists.map((list) =>
        client
          .get<RawWekanCard[]>(`/boards/${projectId}/lists/${list._id}/cards`)
          .then((cards) => (Array.isArray(cards) ? cards : []))
          .catch(() => [] as RawWekanCard[]),
      ),
    )
    // Neither endpoint documents a query parameter: the board's cards arrive
    // whole, flattened over its lists, so page locally.
    const tasks = cardArrays.flat().map((card) => {
      const t = transformCard(card, projectId)
      // Encode composite id
      const listId = card.listId ?? activeLists.find((l) => l._id === card.listId)?._id ?? ''
      t.id = `${projectId}:${listId || card.listId || ''}:${card._id}`
      t.externalId = card._id
      return t
    })
    return pageLocally(tasks, params)
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const { boardId, listId, cardId } = decodeTaskId(id)
    if (!boardId || !listId || !cardId) {
      throw new Error(`wekan: getTask requires composite id "boardId:listId:cardId", got: ${id}`)
    }
    const card = await this.client(credentials).get<RawWekanCard>(
      `/boards/${boardId}/lists/${listId}/cards/${cardId}`,
    )
    if (!card || !card._id) throw new Error(`wekan: card ${cardId} not found`)
    const t = transformCard(card, boardId)
    t.id = id
    t.externalId = cardId
    return t
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    // taskId may be "boardId:cardId" composite or a plain cardId.
    const { boardId, cardId } = decodeCommentTaskId(taskId)
    if (!boardId || !cardId) {
      throw new Error(
        `wekan: listComments requires taskId in "boardId:cardId" format, got: ${taskId}`,
      )
    }
    const comments = await this.client(credentials).get<RawWekanComment[]>(
      `/boards/${boardId}/cards/${cardId}/comments`,
    )
    return pageLocally(
      (Array.isArray(comments) ? comments : []).map((c) => transformComment(c, cardId, boardId)),
      params,
    )
  }

  // getComment is not implemented — Wekan has no single-comment fetch endpoint.

  // ── Tags (Labels) ──────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]> {
    // workspaceId is treated as boardId (or the virtual VIRTUAL_WORKSPACE_ID for "all boards").
    if (!workspaceId || workspaceId === VIRTUAL_WORKSPACE_ID) return pageLocally([], params)
    const board = await this.client(credentials).get<RawWekanBoard>(`/boards/${workspaceId}/export`)
    if (!board || !board.labels) return pageLocally([], params)
    // Labels are embedded whole on the board export: page locally.
    const tags = (board.labels as RawWekanLabel[]).map((label) => {
      const tag = transformLabel(label, workspaceId)
      tag.id = `${workspaceId}:${label._id}`
      tag.externalId = label._id
      return tag
    })
    return pageLocally(tags, params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const { boardId, labelId } = decodeTagId(id)
    if (!boardId || !labelId) {
      throw new Error(`wekan: getTag requires composite id "boardId:labelId", got: ${id}`)
    }
    const board = await this.client(credentials).get<RawWekanBoard>(`/boards/${boardId}/export`)
    const label = (board?.labels as RawWekanLabel[] | undefined)?.find((l) => l._id === labelId)
    if (!label) throw new Error(`wekan: label ${labelId} not found on board ${boardId}`)
    const tag = transformLabel(label, boardId)
    tag.id = id
    tag.externalId = labelId
    return tag
  }

  // ── Workspaces (Virtual) ───────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '')
    return pageLocally([transformWorkspace(buildVirtualWorkspace(serverUrl))], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    if (id !== VIRTUAL_WORKSPACE_ID) {
      throw new Error(`wekan: unknown workspace id ${id}`)
    }
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '')
    return transformWorkspace(buildVirtualWorkspace(serverUrl))
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const users = await this.client(credentials).get<RawWekanUser[]>('/users')
    return pageLocally((Array.isArray(users) ? users : []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const user = await this.client(credentials).get<RawWekanUser>(`/users/${id}`)
    if (!user || !user._id) throw new Error(`wekan: user ${id} not found`)
    return transformUser(user)
  }
}
