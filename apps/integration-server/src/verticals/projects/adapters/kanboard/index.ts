/**
 * Kanboard adapter for the projects vertical.
 *
 * Kanboard is a self-hosted Kanban project-management tool.
 * It exposes a JSON-RPC 2.0 API over a single endpoint: POST <instance>/jsonrpc.php
 *
 * Auth: HTTP Basic with username "jsonrpc" + API token from Kanboard Settings.
 * The instance URL is stored in credentials.extra.baseUrl.
 *
 * Supported resources: projects, tasks, comments, tags, users.
 * Workspaces: Kanboard has no workspace concept; a synthetic single workspace
 *   representing the instance is returned.
 *
 * Webhooks: Kanboard delivers webhooks with a token query param only (no
 *   HMAC signature), so verifyWebhook is not implemented.
 *
 * Docs: https://docs.kanboard.org/v1/api/
 */
import { pageLocally, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
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
import { KanboardClient } from './client'

import { transformProject, type RawKanboardProject } from './transform/project'
import { transformTask, type RawKanboardTask } from './transform/task'
import { transformComment, type RawKanboardComment } from './transform/comment'
import { transformTag, type RawKanboardTag } from './transform/tag'
import { transformWorkspace, type RawKanboardWorkspace } from './transform/workspace'
import { transformUser, type RawKanboardUser } from './transform/user'

// Kanboard uses API key auth — no OAuth client config needed.
export type KanboardAdapterConfig = Record<string, never>

export class KanboardAdapter implements ProjectsAdapter {
  readonly platform = 'kanboard'
  readonly version = '0.1.0'

  constructor(_config?: KanboardAdapterConfig) {}

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
    throw new Error('kanboard uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): KanboardClient {
    return new KanboardClient(credentials)
  }

  /**
   * Kanboard's list procedures take no paging parameter and return the whole
   * collection ("Get all available projects", Parameters: none — see
   * https://docs.kanboard.org/v1/api/project_procedures/), so each caller page
   * is sliced locally by `page`/`limit`, with the total reported.
   */
  private sliceResults<T>(items: T[], params: QueryParams): T[] {
    return pageLocally(items, params)
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const items = await this.client(credentials).call<RawKanboardProject[] | false>('getAllProjects')
    return this.sliceResults(Array.isArray(items) ? items : [], params).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const item = await this.client(credentials).call<RawKanboardProject>('getProjectById', {
      project_id: Number(id),
    })
    if (!item) throw new Error(`Kanboard project ${id} not found`)
    return transformProject(item)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const items = await this.client(credentials).call<RawKanboardTask[] | false>('getAllTasks', {
      project_id: Number(projectId),
      status_id: 1, // 1=open; pass both open+closed via separate calls if needed
    })
    return this.sliceResults(Array.isArray(items) ? items : [], params).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const item = await this.client(credentials).call<RawKanboardTask>('getTask', {
      task_id: Number(id),
    })
    if (!item) throw new Error(`Kanboard task ${id} not found`)
    return transformTask(item)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const items = await this.client(credentials).call<RawKanboardComment[] | false>('getAllComments', {
      task_id: Number(taskId),
    })
    return this.sliceResults(Array.isArray(items) ? items : [], params).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const item = await this.client(credentials).call<RawKanboardComment>('getComment', {
      comment_id: Number(id),
    })
    if (!item) throw new Error(`Kanboard comment ${id} not found`)
    return transformComment(item)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  //
  // Kanboard tags are scoped to projects. listTags() accepts a projectId
  // (passed as workspaceId by the framework) and falls back to getAllTags.

  async listTags(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]> {
    let items: RawKanboardTag[]
    if (workspaceId && workspaceId !== 'default') {
      const raw = await this.client(credentials).call<RawKanboardTag[] | false>('getTagsByProject', {
        project_id: Number(workspaceId),
      })
      items = Array.isArray(raw) ? raw : []
    } else {
      const raw = await this.client(credentials).call<RawKanboardTag[] | false>('getAllTags')
      items = Array.isArray(raw) ? raw : []
    }
    return this.sliceResults(items, params).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // Kanboard has no getTagById procedure — fetch all and find by id.
    const raw = await this.client(credentials).call<RawKanboardTag[] | false>('getAllTags')
    const items = Array.isArray(raw) ? raw : []
    const item = items.find((t) => String(t.id) === id)
    if (!item) throw new Error(`Kanboard tag ${id} not found`)
    return transformTag(item)
  }

  // ── Workspaces ────────────────────────────────────────────────────────────
  //
  // Kanboard has no workspace concept. We synthesise a single "default"
  // workspace representing the instance, using the version string as metadata.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    return pageLocally(await this.instanceWorkspaces(credentials), params)
  }

  /** The whole (one-row) workspace collection: the instance itself. */
  private async instanceWorkspaces(credentials: Credentials): Promise<Workspace[]> {
    let version: string | undefined
    try {
      version =
        (await this.client(credentials).call<string>('getVersion')) ?? undefined
    } catch {
      version = undefined
    }
    const raw: RawKanboardWorkspace = {
      id: 'default',
      name: 'Kanboard',
      version,
    }
    return [transformWorkspace(raw)]
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const [ws] = await this.instanceWorkspaces(credentials)
    return ws!
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    let items: RawKanboardUser[]
    if (workspaceId && workspaceId !== 'default') {
      // getProjectUsers returns { user_id: username } dict — convert to array.
      // Returns false on failure (e.g. project not found).
      const dict = await this.client(credentials).call<Record<string, string> | false>('getProjectUsers', {
        project_id: Number(workspaceId),
      })
      const safeDict = dict && typeof dict === 'object' && !Array.isArray(dict) ? dict : {}
      items = Object.entries(safeDict).map(([userId, username]) => ({
        id: userId,
        username,
        name: username,
      }))
    } else {
      const raw = await this.client(credentials).call<RawKanboardUser[] | false>('getAllUsers')
      items = Array.isArray(raw) ? raw : []
    }
    return this.sliceResults(items, params).map((u) =>
      transformUser(u, workspaceId !== 'default' ? workspaceId : undefined),
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const item = await this.client(credentials).call<RawKanboardUser>('getUser', {
      user_id: Number(id),
    })
    if (!item) throw new Error(`Kanboard user ${id} not found`)
    return transformUser(item)
  }
}
