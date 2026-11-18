/**
 * Every `/v1/{vertical}/*` route is gated by the unified auth middleware, whose
 * first action is to require `?connection_id=` — before routing, before scopes,
 * before the handler. A route that omits it from its OpenAPI parameters is
 * documented as callable when it is not — a reader of the spec (or anyone
 * clicking "Try it out" in the API console) gets a 400 with no indication of
 * what is missing.
 *
 * The by-id route is the easy one to forget precisely because the job id
 * identifies the job on its own — the connection is needed for tenant
 * ownership, not for lookup.
 */
import { describe, it, expect } from 'vitest'
import { buildSyncOpenapiPaths } from '../../src/data-store/sync-openapi'

const paths = buildSyncOpenapiPaths({
  vertical: 'accounting',
  prefix: '/v1/accounting',
  tag: 'Sync',
})

function queryParamNames(operation: { parameters?: Array<Record<string, unknown>> }): string[] {
  return (operation.parameters ?? []).filter((p) => p.in === 'query').map((p) => String(p.name))
}

function requiredQueryParams(operation: { parameters?: Array<Record<string, unknown>> }): string[] {
  return (operation.parameters ?? [])
    .filter((p) => p.in === 'query' && p.required === true)
    .map((p) => String(p.name))
}

describe('sync OpenAPI parameters', () => {
  it('documents connection_id on every sync operation, including the by-id GET', () => {
    const operations: Array<[string, { parameters?: Array<Record<string, unknown>> }]> = []
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        operations.push([`${method.toUpperCase()} ${path}`, operation as never])
      }
    }
    expect(operations.length).toBeGreaterThanOrEqual(3)
    for (const [label, operation] of operations) {
      expect(queryParamNames(operation), label).toContain('connection_id')
    }
  })

  it('marks connection_id required, since the middleware 400s without it', () => {
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        expect(
          requiredQueryParams(operation as never),
          `${method.toUpperCase()} ${path}`,
        ).toContain('connection_id')
      }
    }
  })

  it('explains why the by-id route needs it, since the job id alone identifies the job', () => {
    const byId = Object.entries(paths).find(([p]) => p.includes('{jobId}'))
    expect(byId).toBeDefined()
    const get = (byId?.[1] as { get?: { description?: string } })?.get
    expect(get?.description ?? '').toMatch(/tenant|ownership/i)
  })
})

describe('sync OpenAPI descriptions', () => {
  const entry = Object.entries(paths).find(([p]) => p.endsWith('/sync'))
  const post = (entry?.[1] as { post?: { description?: string } })?.post

  it('states that a plain sync does not need write scope', () => {
    expect(post?.description ?? '').toMatch(/vertical:write.*NOT required|NOT required/i)
  })

  it('states that callback_url additionally requires write scope', () => {
    const d = post?.description ?? ''
    expect(d).toMatch(/callback_url/)
    expect(d).toMatch(/vertical:write/)
  })

  it('tells a read-only caller what to send instead — an empty JSON body', () => {
    // The body is optional but an empty one is not: a request that sets
    // Content-Type: application/json and sends nothing is rejected with
    // `400 Body cannot be empty`, which is what the API console does.
    expect(post?.description ?? '').toMatch(/\{\}/)
  })
})
