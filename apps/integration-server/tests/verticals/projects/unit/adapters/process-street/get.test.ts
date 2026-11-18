/**
 * Read-by-id methods against the documented paths
 * (https://public-api.process.st/api/v1.1/docs/openapi.json):
 *   GET /workflows/{workflowId}                      → PublicApiWorkflowResponse { data, links }
 *   GET /workflow-runs/{workflowRunId}/tasks/{taskId} → GetTaskResponse (flat)
 *   GET /workflow-runs/{workflowRunId}               → GetWorkflowRunResponse (workflowId)
 *   no user-by-id path: getUser refuses with 501 and sends nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { ProcessStreetAdapter } from '../../../../../../src/verticals/projects/adapters/process-street/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { RUN_ID, WORKFLOW_ID, task, workflow } from './fixtures'

vi.mock('axios')

const C: Credentials = { accessToken: 'key-1' }

function fake(routes: Record<string, unknown>): {
  paths: string[]
  headers: Record<string, unknown>[]
} {
  const paths: string[] = []
  const headers: Record<string, unknown>[] = []
  vi.mocked(axios.create).mockImplementation(((config?: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => {
    headers.push({ baseURL: config?.baseURL, ...(config?.headers ?? {}) })
    return {
      get: vi.fn(async (path: string) => {
        paths.push(path)
        if (!(path in routes)) throw new Error(`unexpected GET ${path}`)
        return { data: routes[path] }
      }),
    }
  }) as unknown as typeof axios.create)
  return { paths, headers }
}

afterEach(() => vi.clearAllMocks())

describe('process-street getProject', () => {
  it('reads GET /workflows/{id} and unwraps `data`', async () => {
    const { paths, headers } = fake({
      [`/workflows/${WORKFLOW_ID}`]: { data: workflow(), links: [] },
    })
    const p = ProjectSchema.parse(await new ProcessStreetAdapter().getProject(C, WORKFLOW_ID))
    expect(paths).toEqual([`/workflows/${WORKFLOW_ID}`])
    expect(headers[0]).toMatchObject({
      baseURL: 'https://public-api.process.st/api/v1.1',
      'X-API-Key': 'key-1',
    })
    expect(p.id).toBe(WORKFLOW_ID)
    expect(p.name).toBe('Employee Onboarding')
    expect(p.status).toBe('unknown')
  })
})

describe('process-street getTask', () => {
  const TASK = 'tAsKiDxxxxQBoNMM9kN7KA'

  it('reads the task under its run, and the run for its workflowId', async () => {
    const { paths } = fake({
      [`/workflow-runs/${RUN_ID}/tasks/${TASK}`]: task(),
      [`/workflow-runs/${RUN_ID}`]: {
        id: RUN_ID,
        workflowId: WORKFLOW_ID,
        audit: {
          createdDate: '2024-09-15T14:32:00.000Z',
          createdById: 'u',
          updatedDate: '2024-09-15T14:32:00.000Z',
          updatedById: 'u',
        },
        status: 'Active',
        shared: false,
        migrationStatus: 'Inactive',
      },
    })
    const t = TaskSchema.parse(await new ProcessStreetAdapter().getTask(C, `${RUN_ID}:${TASK}`))
    expect(paths.sort()).toEqual(
      [`/workflow-runs/${RUN_ID}`, `/workflow-runs/${RUN_ID}/tasks/${TASK}`].sort(),
    )
    expect(t.id).toBe(`${RUN_ID}:${TASK}`)
    expect(t.projectId).toBe(WORKFLOW_ID)
  })

  it('never calls the undocumented GET /tasks/{id}; a bare id is refused with 400 and no request', async () => {
    const { paths } = fake({})
    await expect(new ProcessStreetAdapter().getTask(C, TASK)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_ID',
    })
    expect(paths).toEqual([])
  })
})

describe('process-street getUser', () => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { paths } = fake({})
    await expect(
      new ProcessStreetAdapter().getUser(C, 'vGIRpoq0RIwBoNMM3-V-tw'),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(paths).toEqual([])
    expect(vi.mocked(axios.create)).not.toHaveBeenCalled()
  })
})
