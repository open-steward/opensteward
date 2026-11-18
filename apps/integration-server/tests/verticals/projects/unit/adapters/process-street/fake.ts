/**
 * A fake Process Street that honours ONLY what the OpenAPI spec documents
 * (https://public-api.process.st/api/v1.1/docs/openapi.json):
 *
 *   - every list is "returned 20 at a time"; the only paging input is the
 *     opaque `_` cursor ("Omit on the first page"), and the end is the
 *     absence of the `links[]` entry named "next";
 *   - GET /workflows → { workflows, links }, GET /users → { users, links },
 *     GET /workflow-runs/list?workflowId=… → { data, links },
 *     GET /workflow-runs/{id}/tasks → { tasks, links };
 *   - GET /workflows/{id} → { data, links }, GET /workflow-runs/{id} → run,
 *     GET /workflow-runs/{runId}/tasks/{taskId} → task;
 *   - auth is the `X-API-Key` header.
 *
 * Any other path or query parameter throws, and a cursor from another
 * collection or key is refused.
 */
import { vi } from 'vitest'
import axios from 'axios'

export const PS_PAGE = 20
const BASE = 'https://public-api.process.st/api/v1.1'

export interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

export interface FakeWorld {
  workflows: number
  users: number
  /** Workflow id → the task count of each of its runs, in list order. */
  runs: Record<string, number[]>
}

export function wfId(token: string, n: number): string {
  return `wf-${token}-${String(n).padStart(4, '0')}`
}
export function userId(token: string, n: number): string {
  return `us-${token}-${String(n).padStart(4, '0')}`
}
export function runId(token: string, wf: string, r: number): string {
  return `run-${token}-${wf}-${String(r).padStart(3, '0')}`
}
export function taskRawId(r: number, t: number): string {
  return `t${String(r).padStart(3, '0')}-${String(t).padStart(4, '0')}`
}

const audit = {
  createdDate: '2024-09-15T14:32:00.000Z',
  createdBy: { id: 'u1', email: 'a@example.com', username: 'A' },
  updatedDate: '2024-09-15T14:32:00.000Z',
  updatedBy: { id: 'u1', email: 'a@example.com', username: 'A' },
}

function taskRow(run: string, r: number, t: number): Record<string, unknown> {
  return {
    id: taskRawId(r, t),
    name: `Task ${t}`,
    workflowRunId: run,
    status: 'NotCompleted',
    updatedDate: '2024-09-15T14:32:00.000Z',
    updatedBy: audit.updatedBy,
    hidden: false,
    stopped: false,
    taskType: 'Standard',
    links: [],
  }
}

function page<T>(
  rows: T[],
  params: Record<string, unknown>,
  tag: string,
  path: string,
  extraQuery = '',
): { rows: T[]; links: Record<string, unknown>[] } {
  const cur = params['_']
  let start = 0
  if (cur !== undefined) {
    const s = String(cur)
    if (!s.startsWith(`${tag}|`)) throw new Error(`_ ${s} is not from ${tag}`)
    start = Number(s.slice(tag.length + 1))
  }
  const slice = rows.slice(start, start + PS_PAGE)
  const links: Record<string, unknown>[] = [{ name: 'self', href: `${BASE}${path}`, type: 'Api' }]
  if (start + PS_PAGE < rows.length) {
    const next = encodeURIComponent(`${tag}|${start + PS_PAGE}`)
    links.push({ name: 'next', href: `${BASE}${path}?${extraQuery}_=${next}`, type: 'Api' })
  }
  return { rows: slice, links }
}

function onlyParams(params: Record<string, unknown>, allowed: string[], path: string): void {
  for (const k of Object.keys(params))
    if (!allowed.includes(k)) throw new Error(`undocumented query parameter ${k} on ${path}`)
}

export function fakeProcessStreet(world: FakeWorld, requests: Req[] = []): { requests: Req[] } {
  vi.mocked(axios.create).mockImplementation(((config?: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => {
    if (config?.baseURL !== BASE) throw new Error(`unexpected base URL ${config?.baseURL}`)
    const token = String(config?.headers?.['X-API-Key'] ?? '')
    if (!token) throw new Error('missing X-API-Key')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path === '/workflows') {
        onlyParams(params, ['_', 'name'], path)
        const all = Array.from({ length: world.workflows }, (_, i) => ({
          id: wfId(token, i),
          name: `Workflow ${i}`,
          audit,
          links: [],
        }))
        const p = page(all, params, `${token}|wf`, path)
        return { data: { workflows: p.rows, links: p.links } }
      }
      if (path === '/users') {
        onlyParams(params, ['_'], path)
        const all = Array.from({ length: world.users }, (_, i) => ({
          id: userId(token, i),
          email: `${userId(token, i)}@example.com`,
          username: `User ${i}`,
        }))
        const p = page(all, params, `${token}|us`, path)
        return { data: { users: p.rows, links: p.links } }
      }
      if (path === '/workflow-runs/list') {
        onlyParams(params, ['_', 'workflowId', 'status'], path)
        const wf = params['workflowId']
        if (typeof wf !== 'string') throw new Error('runs list without workflowId')
        const counts = world.runs[wf] ?? []
        const all = counts.map((_, r) => ({
          id: runId(token, wf, r),
          workflowId: wf,
          audit: { createdDate: audit.createdDate, updatedDate: audit.updatedDate },
          status: 'Active',
          shared: false,
          migrationStatus: 'Inactive',
          links: [],
        }))
        const p = page(all, params, `${token}|runs|${wf}`, path, `workflowId=${wf}&`)
        return { data: { data: p.rows, links: p.links } }
      }
      const tasks = path.match(/^\/workflow-runs\/([^/]+)\/tasks$/)
      if (tasks) {
        onlyParams(params, ['_'], path)
        const run = decodeURIComponent(tasks[1]!)
        for (const [wf, counts] of Object.entries(world.runs)) {
          for (let r = 0; r < counts.length; r++) {
            if (runId(token, wf, r) !== run) continue
            const all = Array.from({ length: counts[r]! }, (_, t) => taskRow(run, r, t))
            const p = page(all, params, `${token}|tasks|${run}`, path)
            return { data: { tasks: p.rows, links: p.links } }
          }
        }
        const err = Object.assign(new Error('404'), { response: { status: 404 } })
        throw err
      }
      throw new Error(`unexpected GET ${path}`)
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}
