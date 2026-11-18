/**
 * Twproject adapter for the projects vertical.
 *
 * Twproject is self-hosted. Every call is a JSON POST of `{ command, object,
 * APIKey, … }` to `https://[your_server_url]/API/V1/`
 * (https://twproject.com/support/api-documentation/).
 *
 * Canonical mapping:
 *   Projects ← task list with filters { isProject: true }
 *              (task filter `isProject`: "\"true\" for project, \"false\" for task/subtask")
 *   Tasks    ← task list with filters { subtaskOfAncestorId: <project id> }
 *   Users    ← person list
 *
 * Paging: the `list` command takes `pageSize` and `page` (samples 20 and 1)
 * and returns `hasMore`, which is reported as the end signal. No maximum
 * `pageSize` is documented, so the caller's limit is sent as given.
 *
 * Refused (501 before any request):
 *   Comments   — Twproject has no comment object; issue comments can only be
 *                added (`addComment`), never read back.
 *   Workspaces — the objectType list has no workspace; the server is the tenant.
 *   getTask    — no documented task response field carries a parent or
 *                project (`parentId` is documented only as create/update
 *                `data` input, absent from every get/list sample), so the
 *                required `projectId` has no source outside a project's list.
 *   Tags       — no tag object; task `tags` is a comma-separated string.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag — Twproject has no tag object; the documented objectType list is task, issue, person, company, assignment, worklog, expense, additionalCost, revenue, event, document, role, issueType, taskType, departmentType, costCenter, issueImpact, worklogStatus, issueStatus, issueHistory, taskDataHistory, taskLog, deleteLog, fileStorage, fulltext.

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as twprojectExchange,
  refreshCredentials as twprojectRefresh,
} from './auth'
import { TwprojectClient, type TwprojectResponse } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawTwprojectTaskObject } from './transform/project'
import { transformTask } from './transform/task'
import { transformUser, type RawTwprojectPerson } from './transform/user'

/** Connect Link form: the server URL the API lives under, and an API key. */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'serverUrl',
      label: 'Twproject server URL',
      type: 'url',
      required: true,
      helpText:
        'The address of your Twproject server, e.g. https://twproject.example.com — the API is served at https://[your_server_url]/API/V1/.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      placeholder: '1-2529Mzg7p3g13651yFgv56619Ms469g7',
      helpText: `Generate a key on your user's security/login page with "generate key". See ${TOKEN_HELP_URL}`,
    },
  ],
  async exchange(fields) {
    const serverUrl = (fields['serverUrl'] ?? '').trim().replace(/\/+$/, '')
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!serverUrl) throw new Error('Twproject server URL is required.')
    if (!apiKey) throw new Error('Twproject API key is required.')
    return { accessToken: apiKey, extra: { serverUrl } }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** The `id` parameter is documented as an integer; ids come back as strings. */
function intId(id: string, what: string): number {
  if (!/^\d+$/.test(id)) throw notFound(`Twproject ${what} ${id} not found: ids are integers`)
  return Number(id)
}

const COMMENTS_UNSUPPORTED =
  'Twproject cannot list comments: its API has no comment object (objectType is one of "task", "issue", "person", "company", "assignment", "worklog", …), and issue comments can only be added with "addComment" ("This allows you to add a comment to an existing issue with the given id"), never read back.'

const WORKSPACES_UNSUPPORTED =
  'Twproject cannot list workspaces: its API has no workspace object (objectType is one of "task", "issue", "person", "company", "assignment", "worklog", …); each self-hosted server is a single tenant.'

export class TwprojectAdapter implements ProjectsAdapter {
  readonly platform = 'twproject'
  readonly version = '0.2.0'

  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return twprojectExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return twprojectRefresh(credentials)
  }

  /**
   * One page of the documented `list` command: `filters`, `pageSize`, `page`
   * (1-based, sample 1). The platform's `hasMore` is the end signal.
   * `orderBy` is not sent: its documented values (task: name, code, status,
   * type, start, end, …; person: name, code) include no unique key, so none
   * would make page N stable.
   */
  private async listPage<T>(
    credentials: Credentials,
    object: 'task' | 'person',
    filters: Record<string, unknown> | undefined,
    params: QueryParams,
  ): Promise<T[]> {
    const page = typeof params.page === 'number' && params.page >= 1 ? params.page : 1
    const pageSize = typeof params.limit === 'number' ? params.limit : DEFAULT_PAGE_SIZE
    const res: TwprojectResponse<T> = await new TwprojectClient(credentials).command<T>({
      command: 'list',
      object,
      ...(filters ? { filters } : {}),
      pageSize,
      page,
    })
    if (typeof res.hasMore === 'boolean') reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.objects ?? []
  }

  /** The documented `get` command: `id` (integer) and `full` (boolean). */
  private async getOne<T>(
    credentials: Credentials,
    object: 'task' | 'person',
    id: string,
  ): Promise<T> {
    const res = await new TwprojectClient(credentials).command<T>({
      command: 'get',
      object,
      id: intId(id, object),
      full: true,
    })
    if (!res.object) throw notFound(`Twproject ${object} ${id} not found`)
    return res.object
  }

  // ── Projects ────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listPage<RawTwprojectTaskObject>(
      credentials,
      'task',
      { isProject: true },
      params,
    )
    return rows.map(transformProject)
  }

  /**
   * `get task` by id also returns non-project tasks. The only documented
   * narrowing is the task list filter `id` ("type": "string", "qbe": true)
   * with `isProject`, whose QBE match semantics are undocumented, so no
   * project check is made here.
   */
  async getProject(credentials: Credentials, id: string): Promise<Project> {
    return transformProject(await this.getOne<RawTwprojectTaskObject>(credentials, 'task', id))
  }

  // ── Tasks ───────────────────────────────────────────────────────────────

  /**
   * Every task below the project (task filter `subtaskOfAncestorId`, type
   * integer). An id that is not an integer is sent as given, for the server to
   * refuse, rather than being refused here.
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const ancestor = /^\d+$/.test(projectId) ? Number(projectId) : projectId
    const rows = await this.listPage<RawTwprojectTaskObject>(
      credentials,
      'task',
      { subtaskOfAncestorId: ancestor },
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(_credentials: Credentials, id: string): Promise<Task> {
    throw notSupported(
      `Twproject cannot read task ${id} on its own: no documented task response field carries a parent or project (parentId is documented only in the create/update data input, and is absent from the get and list response samples), so its project is known only from listTasks.`,
    )
  }

  // ── Comments ────────────────────────────────────────────────────────────

  async listComments(
    _credentials: Credentials,
    _taskId: string,
    _params: QueryParams,
  ): Promise<Comment[]> {
    throw notSupported(COMMENTS_UNSUPPORTED)
  }

  async getComment(_credentials: Credentials, _id: string): Promise<Comment> {
    throw notSupported(COMMENTS_UNSUPPORTED.replace('cannot list', 'cannot read'))
  }

  // ── Workspaces ──────────────────────────────────────────────────────────

  async listWorkspaces(_credentials: Credentials, _params: QueryParams): Promise<Workspace[]> {
    throw notSupported(WORKSPACES_UNSUPPORTED)
  }

  async getWorkspace(_credentials: Credentials, _id: string): Promise<Workspace> {
    throw notSupported(WORKSPACES_UNSUPPORTED.replace('cannot list', 'cannot read'))
  }

  // ── Users ───────────────────────────────────────────────────────────────

  /** Twproject has no workspace, so the route's workspace id is not sent. */
  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listPage<RawTwprojectPerson>(credentials, 'person', undefined, params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    return transformUser(await this.getOne<RawTwprojectPerson>(credentials, 'person', id))
  }
}

export { DEFAULT_PAGE_SIZE }
