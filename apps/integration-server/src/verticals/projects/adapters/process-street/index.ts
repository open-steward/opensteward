/**
 * Process Street adapter for the projects vertical.
 *
 * Docs (OpenAPI): https://public-api.process.st/api/v1.1/docs/openapi.json
 * Auth: API key in the `X-API-Key` header, stored as credentials.accessToken.
 *
 * Model mapping:
 *   Workflow                → Project  ("the reusable definition")
 *   Task of a Workflow Run  → Task     (a run is "one *instance* of running a Workflow")
 *   User                    → User
 *
 * Endpoints:
 *   listProjects  GET /workflows                         → { workflows[], links[] }
 *   getProject    GET /workflows/{workflowId}            → { data, links[] }
 *   listTasks     GET /workflow-runs/list?workflowId=…   → { data[], links[] }, then for
 *                 each run GET /workflow-runs/{workflowRunId}/tasks → { tasks[], links[] }
 *   getTask       GET /workflow-runs/{workflowRunId}/tasks/{taskId}, plus
 *                 GET /workflow-runs/{workflowRunId} for the run's workflowId
 *   listUsers     GET /users                             → { users[], links[] }
 *   getUser       refused: the spec has no user-by-id path.
 *
 * Paging: every list is "returned 20 at a time" and pages by the opaque `_`
 * cursor from the `next` link; there is no page-size parameter. Every list
 * therefore goes through `pageByRows`, which cuts the caller's exact page out
 * of the 20-row upstream pages and reports `hasMore` from the `next` link.
 */
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { Credentials, CredentialField, CursorPage, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ProcessStreetClient, nextCursor, type ProcessStreetLink } from './client'

import { transformProject, type RawProcessStreetWorkflow } from './transform/project'
import { parseTaskId, transformTask, type RawProcessStreetTask } from './transform/task'
import { transformUser, type RawProcessStreetUser } from './transform/user'

export interface ProcessStreetAdapterConfig {
  /** Unused — Process Street uses API key auth. Present for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** ListWorkflowsResponse */
interface ListWorkflowsResponse {
  workflows?: RawProcessStreetWorkflow[]
  links?: ProcessStreetLink[]
}

/** PublicApiWorkflowResponse (required: data) */
interface WorkflowResponse {
  data: RawProcessStreetWorkflow
  links?: ProcessStreetLink[]
}

/** PublicApiWorkflowRunListResponse; each run requires id and workflowId. */
interface ListWorkflowRunsResponse {
  data?: { id: string; workflowId: string }[]
  links?: ProcessStreetLink[]
}

/** GetWorkflowRunResponse (required: id, audit, status, workflowId, shared, migrationStatus) */
interface WorkflowRunResponse {
  id: string
  workflowId: string
}

/** ListTasksResponse */
interface ListTasksResponse {
  tasks?: RawProcessStreetTask[]
  links?: ProcessStreetLink[]
}

/** ListUsersResponse */
interface ListUsersResponse {
  users?: RawProcessStreetUser[]
  links?: ProcessStreetLink[]
}

/**
 * Where one upstream tasks page starts in the flattened stream of a
 * workflow's tasks: a page of runs (fetched by `runsCursor`, or already held
 * in `runs`), the run within it, and the `_` cursor of that run's tasks page.
 * Immutable, so replaying a position re-fetches the same page.
 */
interface TaskPosition {
  runsCursor?: string
  runs?: { ids: readonly string[]; next?: string }
  index: number
  taskCursor?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function cursorParam(cursor: string | undefined): Record<string, unknown> {
  return cursor === undefined ? {} : { _: cursor }
}

export class ProcessStreetAdapter implements ProjectsAdapter {
  readonly platform = 'process-street'
  readonly version = '0.2.0'

  constructor(_config?: ProcessStreetAdapterConfig) {}

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
    throw new Error('process-street uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are long-lived; no refresh needed
    return credentials
  }

  private client(credentials: Credentials): ProcessStreetClient {
    return new ProcessStreetClient(credentials)
  }

  /** Row-pager key: the connection (an API key "carries the permissions of the user that created it") plus the collection. */
  private key(credentials: Credentials, collection: string): string {
    return cursorPagerKey(connectionScope('process-street', credentials), collection, {})
  }

  // ── Projects (Workflows) ────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const result = await pageByRows<Project>(
      this.key(credentials, '/workflows'),
      params,
      async (cursor): Promise<CursorPage<Project, string>> => {
        const res = await client.get<ListWorkflowsResponse>('/workflows', cursorParam(cursor))
        return {
          // "Returns a list of active workflows."
          items: (res.workflows ?? []).map((w) => transformProject(w, 'active')),
          next: nextCursor(res.links),
        }
      },
    )
    return result.items
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<WorkflowResponse>(
      `/workflows/${encodeURIComponent(id)}`,
    )
    return transformProject(res.data, 'unknown')
  }

  // ── Tasks (tasks of every run of a Workflow) ────────────────────────────────

  /**
   * The tasks of every non-deleted run of workflow `projectId`, run by run.
   * GET /workflow-runs/list: "Filter results to runs of a specific workflow"
   * (`workflowId`); with no `status`, "include all non-deleted runs". Each
   * run's tasks come from GET /workflow-runs/{workflowRunId}/tasks, "returned
   * 20 at a time, sorted in order".
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = this.client(credentials)
    const fetchRuns = async (cursor: string | undefined) => {
      const res = await client.get<ListWorkflowRunsResponse>('/workflow-runs/list', {
        workflowId: projectId,
        ...cursorParam(cursor),
      })
      return { ids: (res.data ?? []).map((r) => r.id), next: nextCursor(res.links) }
    }
    const result = await pageByRows<Task, TaskPosition>(
      this.key(credentials, `/workflow-runs/list?workflowId=${projectId}:tasks`),
      params,
      async (position): Promise<CursorPage<Task, TaskPosition>> => {
        const runs = position?.runs ?? (await fetchRuns(position?.runsCursor))
        const index = position?.index ?? 0
        const runId = runs.ids[index]
        if (runId === undefined) {
          // An empty page of runs: continue with the next one, if any.
          return { items: [], next: runs.next ? { runsCursor: runs.next, index: 0 } : null }
        }
        const res = await client.get<ListTasksResponse>(
          `/workflow-runs/${encodeURIComponent(runId)}/tasks`,
          cursorParam(position?.taskCursor),
        )
        const taskNext = nextCursor(res.links)
        let next: TaskPosition | null
        if (taskNext) next = { runs, index, taskCursor: taskNext }
        else if (index + 1 < runs.ids.length) next = { runs, index: index + 1 }
        else if (runs.next) next = { runsCursor: runs.next, index: 0 }
        else next = null
        return { items: (res.tasks ?? []).map((t) => transformTask(t, projectId)), next }
      },
    )
    return result.items
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const ref = parseTaskId(id)
    if (!ref) {
      throw Object.assign(
        new Error(
          `Process Street task id must be "<workflowRunId>:<taskId>" (a task is read from GET /workflow-runs/{workflowRunId}/tasks/{taskId}); got "${id}"`,
        ),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    }
    const client = this.client(credentials)
    const runPath = `/workflow-runs/${encodeURIComponent(ref.workflowRunId)}`
    const [task, run] = await Promise.all([
      client.get<RawProcessStreetTask>(`${runPath}/tasks/${encodeURIComponent(ref.taskId)}`),
      client.get<WorkflowRunResponse>(runPath),
    ])
    return transformTask(task, run.workflowId)
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const client = this.client(credentials)
    const result = await pageByRows<User>(
      this.key(credentials, '/users'),
      params,
      async (cursor): Promise<CursorPage<User, string>> => {
        const res = await client.get<ListUsersResponse>('/users', cursorParam(cursor))
        return { items: (res.users ?? []).map(transformUser), next: nextCursor(res.links) }
      },
    )
    return result.items
  }

  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    throw notSupported(
      'Process Street cannot read a user by id: the API documents only "GET /users" ("Returns a list of users."), with no /users/{userId} path',
    )
  }
}
