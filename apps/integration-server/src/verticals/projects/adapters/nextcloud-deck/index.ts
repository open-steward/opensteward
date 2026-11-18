/**
 * Nextcloud Deck adapter for the projects vertical.
 *
 * Nextcloud Deck organises work as:
 *   Boards (→ Project) → Stacks (columns) → Cards (→ Task)
 *   Board labels (→ Tag), Card comments (→ Comment)
 *   Board ACL members / card assignees (→ User)
 *   The Nextcloud server itself is the single Workspace.
 *
 * Auth: HTTP Basic Auth with a Nextcloud App Password (api_key model).
 * No OAuth flow; no webhooks signature scheme documented.
 *
 * API base: <serverUrl>/index.php/apps/deck/api/v1.0
 * OCS comments: <serverUrl>/ocs/v2.php/apps/deck/api/v1.0
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
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
import { NextcloudDeckClient } from './client'
import { DEFAULT_PAGE_SIZE, DECK_COMMENT_MAX_LIMIT } from './constants'

import { transformProject, type RawNextcloudDeckBoard } from './transform/project'
import { transformCard, type RawNextcloudDeckCard } from './transform/task'
import { transformComment, type RawNextcloudDeckComment } from './transform/comment'
import { transformLabel, type RawNextcloudDeckLabel } from './transform/tag'
import { transformWorkspace } from './transform/workspace'
import { transformUser, type RawNextcloudDeckUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NextcloudDeckAdapterConfig {}

/** OCS API envelope */
interface OcsEnvelope<T> {
  ocs?: {
    meta?: { status?: string; statuscode?: number }
    data?: T
  }
}

/** Stack response (contains cards array) */
interface RawNextcloudDeckStack {
  id: number
  title?: string
  boardId?: number
  order?: number
  cards?: RawNextcloudDeckCard[]
  lastModified?: number
  [key: string]: unknown
}

export class NextcloudDeckAdapter implements ProjectsAdapter {
  readonly platform = 'nextcloud-deck'
  readonly version = '0.1.0'

  constructor(_config: NextcloudDeckAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('nextcloud-deck uses Basic Auth with app passwords; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // No webhook signature scheme documented for Nextcloud Deck.
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  private client(credentials: Credentials): NextcloudDeckClient {
    return new NextcloudDeckClient(credentials)
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────
  // The Nextcloud server is the single workspace. Return a synthetic record.
  async listWorkspaces(credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '')
    return [transformWorkspace({ serverUrl })]
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '')
    return transformWorkspace({ serverUrl })
  }

  // ── Projects (Boards) ──────────────────────────────────────────────────────
  async listProjects(credentials: Credentials, _params: QueryParams): Promise<Project[]> {
    const boards = await this.client(credentials).get<RawNextcloudDeckBoard[]>('/boards')
    return (boards ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const board = await this.client(credentials).get<RawNextcloudDeckBoard>(`/boards/${id}`)
    return transformProject(board)
  }

  // ── Tasks (Cards) ──────────────────────────────────────────────────────────
  // Cards are nested inside stacks. We fetch all stacks for a board and
  // flatten their cards arrays.
  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const limit = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const stacks = await this.client(credentials).get<RawNextcloudDeckStack[]>(
      `/boards/${projectId}/stacks`,
    )
    const cards: Task[] = []
    for (const stack of stacks ?? []) {
      for (const card of stack.cards ?? []) {
        cards.push(transformCard({ ...card, boardId: card.boardId ?? Number(projectId), stackId: card.stackId ?? stack.id }, projectId))
        if (cards.length >= limit) break
      }
      if (cards.length >= limit) break
    }
    return cards
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id format: "<boardId>/<stackId>/<cardId>"
    const parts = id.split('/')
    if (parts.length !== 3) {
      throw new Error(
        `nextcloud-deck getTask: id must be "<boardId>/<stackId>/<cardId>", got "${id}"`,
      )
    }
    const [boardId, stackId, cardId] = parts
    const card = await this.client(credentials).get<RawNextcloudDeckCard>(
      `/boards/${boardId}/stacks/${stackId}/cards/${cardId}`,
    )
    return transformCard({ ...card, boardId: Number(boardId), stackId: Number(stackId) }, boardId)
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  // GET /cards/{cardId}/comments pages by `limit` + `offset`; "If no or no
  // more comments are available the list will be empty", so a short page is
  // the end (https://deck.readthedocs.io/en/latest/API/). The docs give no
  // maximum, but Deck's CommentService::list silently clamps `limit` to 200
  // (stable31 and main), so a caller page above 200 is fetched as consecutive
  // offset chunks of at most DECK_COMMENT_MAX_LIMIT rows.
  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    let offset = pageOffset(params, limit)
    // taskId may be compound "<boardId>/<stackId>/<cardId>" — OCS endpoint needs plain cardId
    const parts = taskId.split('/')
    const plainCardId = parts.length === 3 ? parts[2] : taskId
    const client = this.client(credentials)
    const items: RawNextcloudDeckComment[] = []
    let ended = false
    while (items.length < limit) {
      const size = Math.min(DECK_COMMENT_MAX_LIMIT, limit - items.length)
      const res = await client.ocsGet<OcsEnvelope<RawNextcloudDeckComment[]>>(
        `/cards/${plainCardId}/comments`,
        { limit: size, offset },
      )
      const chunk: RawNextcloudDeckComment[] = Array.isArray(res)
        ? (res as RawNextcloudDeckComment[])
        : ((res as OcsEnvelope<RawNextcloudDeckComment[]>).ocs?.data ?? [])
      items.push(...chunk)
      offset += chunk.length
      if (chunk.length < size) {
        ended = true
        break
      }
    }
    reportUpstreamPage(params, { hasMore: !ended })
    return items.map((c) => transformComment(c, taskId))
  }

  // ── Tags (Labels) ─────────────────────────────────────────────────────────
  // Labels are fetched from a board. workspaceId is used as boardId here.
  // GET /boards/{boardId} takes no paging input and returns every label, so
  // the adapter pages them locally.
  async listTags(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]> {
    // workspaceId doubles as boardId in this adapter context.
    const board = await this.client(credentials).get<RawNextcloudDeckBoard>(`/boards/${workspaceId}`)
    const tags = (board.labels ?? []).map((l: RawNextcloudDeckLabel) => transformLabel(l, workspaceId))
    return pageLocally(tags, params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // id format: "<boardId>/<labelId>"
    const parts = id.split('/')
    if (parts.length !== 2) {
      throw new Error(
        `nextcloud-deck getTag: id must be "<boardId>/<labelId>", got "${id}"`,
      )
    }
    const [boardId, labelId] = parts
    const label = await this.client(credentials).get<RawNextcloudDeckLabel>(
      `/boards/${boardId}/labels/${labelId}`,
    )
    return transformLabel(label, boardId)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  // Board ACL participants serve as the user list for a given board.
  // GET /boards/{boardId} takes no paging input and returns the owner and
  // every ACL entry, so the adapter pages the deduplicated list locally.
  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    // Fetch the board with ACL info
    const board = await this.client(credentials).get<RawNextcloudDeckBoard & {
      acl?: Array<{ participant?: RawNextcloudDeckUser }>
      owner?: RawNextcloudDeckUser
    }>(`/boards/${workspaceId}`)
    const seen = new Set<string>()
    const users: User[] = []
    const add = (u: RawNextcloudDeckUser | undefined) => {
      if (!u?.uid || seen.has(u.uid)) return
      seen.add(u.uid)
      users.push(transformUser(u, workspaceId))
    }
    add(board.owner)
    for (const entry of board.acl ?? []) {
      add(entry.participant)
    }
    return pageLocally(users, params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // id format: "<boardId>/<uid>" — we derive the user from the board acl
    const parts = id.split('/')
    if (parts.length < 2) {
      throw new Error(
        `nextcloud-deck getUser: id must be "<boardId>/<uid>", got "${id}"`,
      )
    }
    const boardId = parts[0]
    const uid = parts.slice(1).join('/')
    const users = await this.listUsers(credentials, boardId, {})
    const user = users.find((u) => u.externalId === uid)
    if (!user) throw new Error(`nextcloud-deck user ${uid} not found on board ${boardId}`)
    return user
  }
}
