/**
 * Adobe Workfront adapter — projects vertical.
 *
 * Workfront's REST API lives at `<customer-domain>/attask/api/v15.0`.
 * Each object type has a code-named endpoint (`proj`, `task`, `note`,
 * `user`, `group`); listing is `/<obj>/search` with `$$FIRST`/`$$LIMIT`
 * paging and `fields` selection; a single object is `/<obj>/<id>`.
 * Responses are wrapped in a `{ data }` envelope.
 *
 * Mapping notes:
 *  - Workspace ⇒ Workfront Group (no first-class workspace entity).
 *  - Comment   ⇒ Workfront Note.
 *  - Tags are NOT modelled (Workfront uses custom forms/categories, out
 *    of scope for the canonical schema) → listTags/getTag omitted, so
 *    they auto-501.
 *  - Event Subscriptions are unsigned → no webhook verification.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — Workfront has no dedicated tag/label object; the
 *   nearest concept is the Category (custom-form) object (objCode ctgy)
 *   which is an organizational container for custom forms, not a
 *   name/color label for work items.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as workfrontExchange, refreshCredentials as workfrontRefresh } from './auth'
import { WorkfrontClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawWorkfrontProject } from './transform/project'
import { transformTask, type RawWorkfrontTask } from './transform/task'
import { transformComment, type RawWorkfrontNote } from './transform/comment'
import { transformWorkspace, type RawWorkfrontGroup } from './transform/workspace'
import { transformUser, type RawWorkfrontUser } from './transform/user'

export interface WorkfrontAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide Workfront domain, e.g. `https://myorg.my.workfront.com`.
   * Optional: the domain is normally the customer's, collected at connect time
   * (`oauthFields`) and read back from `credentials.extra.instanceUrl`.
   */
  instanceUrl?: string
  scopes?: string[]
}

interface ListResponse<T> {
  data?: T[]
  error?: unknown
}

interface GetResponse<T> {
  data?: T
  error?: unknown
}

const PROJECT_FIELDS =
  'ID,name,description,status,ownerID,groupID,plannedStartDate,plannedCompletionDate,entryDate,lastUpdateDate,percentComplete'
const TASK_FIELDS =
  'ID,name,description,status,priority,assignedToID,parentID,projectID,taskNumber,numberOfChildren,plannedCompletionDate,entryDate,lastUpdateDate,percentComplete'
const NOTE_FIELDS = 'ID,noteText,subject,ownerID,projectID,taskID,opTaskID,parentNoteID,entryDate'
const GROUP_FIELDS = 'ID,name,description,parentID'
const USER_FIELDS = 'ID,name,emailAddr,username,homeGroupID,companyID'

export class WorkfrontAdapter implements ProjectsAdapter {
  readonly platform = 'workfront'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private instanceUrl: string | undefined
  private scopes: string[]

  constructor(config: WorkfrontAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.instanceUrl = config.instanceUrl
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /**
   * OAuth and REST both live on the customer's own Workfront domain, which
   * deployment config cannot know. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'Workfront domain',
        type: 'text',
        required: true,
        placeholder: 'myorg.my.workfront.com',
        helpText:
          'The host you open Workfront at: myorg.my.workfront.com, or myorg.my.workfront.adobe.com if your organisation signs in through experience.adobe.com.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['instanceUrl'] ?? this.instanceUrl,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return workfrontExchange(code, redirectUri, this.clientId, this.clientSecret, this.instanceUrl)
  }

  /** Exchange on the customer's domain and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return workfrontExchange(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['instanceUrl'] ?? this.instanceUrl,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return workfrontRefresh(credentials, this.clientId, this.clientSecret, this.instanceUrl)
  }

  private client(credentials: Credentials): WorkfrontClient {
    return new WorkfrontClient(credentials, this.instanceUrl)
  }

  /** Workfront paging: `$$LIMIT` (page size, max 2000) + `$$FIRST` (offset). */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      $$LIMIT: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] !== undefined ? { $$FIRST: Number(params['cursor']) } : {}),
    }
  }

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<ListResponse<RawWorkfrontProject>>('/proj/search', {
      ...this.listParams(params),
      fields: PROJECT_FIELDS,
    })
    return (res.data ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<GetResponse<RawWorkfrontProject>>(`/proj/${id}`, {
      fields: PROJECT_FIELDS,
    })
    if (!res.data) throw new Error(`Workfront project ${id} not found`)
    return transformProject(res.data)
  }

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<ListResponse<RawWorkfrontTask>>('/task/search', {
      ...this.listParams(params),
      projectID: projectId,
      fields: TASK_FIELDS,
    })
    return (res.data ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<GetResponse<RawWorkfrontTask>>(`/task/${id}`, {
      fields: TASK_FIELDS,
    })
    if (!res.data) throw new Error(`Workfront task ${id} not found`)
    return transformTask(res.data)
  }

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<ListResponse<RawWorkfrontNote>>('/note/search', {
      ...this.listParams(params),
      taskID: taskId,
      fields: NOTE_FIELDS,
    })
    return (res.data ?? []).map((n) => transformComment(n, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawWorkfrontNote>>(`/note/${id}`, {
      fields: NOTE_FIELDS,
    })
    if (!res.data) throw new Error(`Workfront note ${id} not found`)
    return transformComment(res.data)
  }

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ListResponse<RawWorkfrontGroup>>('/group/search', {
      ...this.listParams(params),
      fields: GROUP_FIELDS,
    })
    return (res.data ?? []).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<GetResponse<RawWorkfrontGroup>>(`/group/${id}`, {
      fields: GROUP_FIELDS,
    })
    if (!res.data) throw new Error(`Workfront group ${id} not found`)
    return transformWorkspace(res.data)
  }

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse<RawWorkfrontUser>>('/user/search', {
      ...this.listParams(params),
      homeGroupID: workspaceId,
      fields: USER_FIELDS,
    })
    return (res.data ?? []).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetResponse<RawWorkfrontUser>>(`/user/${id}`, {
      fields: USER_FIELDS,
    })
    if (!res.data) throw new Error(`Workfront user ${id} not found`)
    return transformUser(res.data)
  }
}
