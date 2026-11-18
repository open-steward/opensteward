/**
 * The rendered spec must agree with the committed one about servers.
 *
 * The docs-server does not serve `docs/openapi/openapi.json` verbatim — it
 * rebuilds every `servers` block on each request so an operator's host/port
 * edits in /settings apply without regenerating the spec. That means the file
 * on disk and the thing a reader actually sees can disagree, silently, and the
 * reader only ever sees the second one.
 *
 * So the re-render must preserve each path's server-block kind — replacing
 * a live-only override with the plain root block would give the same URL,
 * the *global* server's description, and no hint why the override exists:
 * a pointless-looking duplicate.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildServer } from '../../src/server'

interface Server {
  url: string
  description?: string
  variables?: Record<string, unknown>
}

let fastify: FastifyInstance
let dir: string

/** A spec shaped like the real one: both override kinds plus a plain path. */
const SPEC = {
  openapi: '3.1.0',
  info: { title: 'OpenSteward', version: '0.0.0' },
  servers: [{ url: 'placeholder' }],
  paths: {
    '/accounting/invoices': { get: { responses: {} } },
    '/health': {
      'x-opensteward-servers': 'unversioned',
      servers: [{ url: 'placeholder' }],
      get: { responses: {} },
    },
    '/{vertical}/sync': {
      'x-opensteward-servers': 'live-only',
      servers: [{ url: 'placeholder' }],
      post: { responses: {} },
    },
  },
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'oi-docs-servers-'))
  writeFileSync(join(dir, 'openapi.json'), JSON.stringify(SPEC))
  fastify = await buildServer({ docsDir: dir })
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function rendered(): Promise<Record<string, never> & Record<string, unknown>> {
  const res = await fastify.inject({ method: 'GET', url: '/specs/openapi.json' })
  expect(res.statusCode).toBe(200)
  return res.json()
}

describe('the rendered servers block', () => {
  it('offers both live and sandbox at the top level', async () => {
    const spec = await rendered()
    const servers = spec.servers as Server[]
    expect(servers).toHaveLength(2)
    expect(servers[0].url).not.toContain('/test/')
    expect(servers[1].url).toContain('/test/')
  })

  it('keeps an unversioned path off the version prefix', async () => {
    // Left to inherit the root block, /health would render as /v1/health and
    // every Try-it-out against it would 404.
    const spec = await rendered()
    const paths = spec.paths as Record<string, { servers: Server[] }>
    expect(paths['/health'].servers[0].url).not.toContain('{version}')
    expect(paths['/health'].servers[0].description).toMatch(/unversioned/i)
  })

  it('renders the live-only override with its own description, not the root one', async () => {
    // The load-bearing case.
    const spec = await rendered()
    const paths = spec.paths as Record<string, { servers: Server[] }>
    const sync = paths['/{vertical}/sync'].servers[0]
    const root = (spec.servers as Server[])[0]

    expect(sync.url).toBe(root.url) // same address …
    expect(sync.description).not.toBe(root.description) // … different meaning
    expect(sync.description).toMatch(/sandbox/i)
  })

  it('leaves a plain versioned path inheriting the global block', async () => {
    // Only routes that genuinely differ carry an override; the other ~167 must
    // not, or the sandbox dropdown stops applying to them.
    const spec = await rendered()
    const paths = spec.paths as Record<string, Record<string, unknown>>
    expect(paths['/accounting/invoices'].servers).toBeUndefined()
  })
})
