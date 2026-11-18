/**
 * Hive adapter — reference implementation for the projects vertical.
 *
 * Cleanest flat-task model. Sections are presentational (ignored at the
 * canonical level). Subtasks resolved via `parent.gid` → `Task.parentId`.
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as hiveExchange, refreshCredentials as hiveRefresh } from './auth'
import { HiveClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyHiveWebhook, parseHiveWebhookEvents } from './webhook'

import { transformProject, type RawHiveProject } from './transform/project'
import { transformTask, type RawHiveTask } from './transform/task'
import { transformComment, type RawHiveStory } from './transform/comment'
import { transformTag, type RawHiveTag } from './transform/tag'
import { transformWorkspace, type RawHiveWorkspace } from './transform/workspace'
import { transformUser, type RawHiveUser } from './transform/user'

export interface HiveAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> {
  data?: T[]
  next_page?: { offset: string; path: string } | null
}

interface GetResponse<T> {
  data?: T
}

export class HiveAdapter implements ProjectsAdapter {
  readonly platform = 'hive'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: HiveAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return hiveExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return hiveRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHiveWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHiveWebhookEvents(payload)
  }

  private client(credentials: Credentials): HiveClient {
    return new HiveClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { offset: String(params['cursor']) } : {}),
    }
  }

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    const path = workspaceId ? `/workspaces/${workspaceId}/projects` : '/projects'
    const res = await this.client(credentials).get<ListResponse<RawHiveProject>>(path, {
      ...this.listParams(params),
      opt_fields:
        'gid,name,notes,archived,current_status,owner,workspace,start_on,due_on,created_at,modified_at',
    })
    return (res.data ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<GetResponse<RawHiveProject>>(
      `/projects/${id}`,
      {
        opt_fields:
          'gid,name,notes,archived,current_status,owner,workspace,start_on,due_on,created_at,modified_at',
      },
    )
    if (!res.data) throw new Error(`Hive project ${id} not found`)
    return transformProject(res.data)
  }

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<ListResponse<RawHiveTask>>(
      `/projects/${projectId}/tasks`,
      {
        ...this.listParams(params),
        opt_fields:
          'gid,name,notes,completed,due_on,due_at,parent,projects,assignee,tags,num_subtasks,custom_fields,created_at,modified_at,resource_subtype',
      },
    )
    return (res.data ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<GetResponse<RawHiveTask>>(`/tasks/${id}`, {
      opt_fields:
        'gid,name,notes,completed,due_on,due_at,parent,projects,assignee,tags,num_subtasks,custom_fields,created_at,modified_at,resource_subtype',
    })
    if (!res.data) throw new Error(`Hive task ${id} not found`)
    return transformTask(res.data)
  }

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<ListResponse<RawHiveStory>>(
      `/tasks/${taskId}/stories`,
      {
        ...this.listParams(params),
        opt_fields: 'gid,text,html_text,type,resource_subtype,created_by,created_at,target',
      },
    )
    return (res.data ?? [])
      .filter((s) => s.type === 'comment' || s.resource_subtype === 'comment_added')
      .map((s) => transformComment(s, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawHiveStory>>(`/stories/${id}`)
    if (!res.data) throw new Error(`Hive story ${id} not found`)
    return transformComment(res.data)
  }

  async listTags(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<ListResponse<RawHiveTag>>(
      `/workspaces/${workspaceId}/tags`,
      { ...this.listParams(params), opt_fields: 'gid,name,color,workspace' },
    )
    return (res.data ?? []).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<GetResponse<RawHiveTag>>(`/tags/${id}`)
    if (!res.data) throw new Error(`Hive tag ${id} not found`)
    return transformTag(res.data)
  }

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ListResponse<RawHiveWorkspace>>('/workspaces', {
      ...this.listParams(params),
      opt_fields: 'gid,name,is_organization,email_domains',
    })
    return (res.data ?? []).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<GetResponse<RawHiveWorkspace>>(
      `/workspaces/${id}`,
    )
    if (!res.data) throw new Error(`Hive workspace ${id} not found`)
    return transformWorkspace(res.data)
  }

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse<RawHiveUser>>(
      `/workspaces/${workspaceId}/users`,
      { ...this.listParams(params), opt_fields: 'gid,name,email,workspaces' },
    )
    return (res.data ?? []).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetResponse<RawHiveUser>>(`/users/${id}`)
    if (!res.data) throw new Error(`Hive user ${id} not found`)
    return transformUser(res.data)
  }
}
