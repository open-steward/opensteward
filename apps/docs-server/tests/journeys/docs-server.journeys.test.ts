/**
 * User-journey regression test for the docs-server (the public docs + API
 * reference site: the Unified API and the Operator API).
 *
 * The story is a developer landing on the docs site and finding their way
 * around: the landing page, the Unified API reference, the machine-readable OpenAPI
 * spec, the platform catalogue, and search all answer. If a route disappears
 * or starts erroring, this journey flags it.
 *
 * In-process: boots the real docs-server over a throwaway docs dir containing a
 * minimal OpenAPI spec, driven with fastify.inject().
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildServer } from '../../src/server'

let fastify: FastifyInstance
let dir: string

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'oi-docs-'))
  // A minimal but valid unified spec so the /specs/openapi.json handler mounts.
  writeFileSync(
    join(dir, 'openapi.json'),
    JSON.stringify({ openapi: '3.1.0', info: { title: 'OpenSteward', version: '0.0.0' }, paths: {} }),
  )
  fastify = await buildServer({ docsDir: dir })
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('Journey: A developer explores the documentation site', () => {
  it('the landing page loads as HTML', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('OpenSteward')
  })

  it('the Unified API page loads the Swagger UI', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/unified-api' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('swagger-ui')
    expect(res.body).toContain('Unified API - Documentation - OpenSteward')
  })

  // The page was /api-reference before it was renamed to pair with
  // /operator-api. Bookmarks, older admin consoles and other sites still
  // link there, so the old path must stay a permanent redirect.
  it('the old /api-reference URL permanently redirects to /unified-api', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api-reference' })
    expect(res.statusCode).toBe(301)
    expect(res.headers.location).toBe('/unified-api')
  })

  it('keeps the query string across the /api-reference redirect', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api-reference?urls.primaryName=x' })
    expect(res.statusCode).toBe(301)
    expect(res.headers.location).toBe('/unified-api?urls.primaryName=x')
  })

  it('lists /unified-api, not the old path, in the sitemap', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/sitemap.xml' })
    expect(res.body).toContain('<loc>/unified-api</loc>')
    expect(res.body).not.toContain('/api-reference')
  })

  it('the machine-readable OpenAPI spec is served as JSON', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/specs/openapi.json' })
    expect(res.statusCode).toBe(200)
    expect(res.json().openapi).toBe('3.1.0')
  })

  it('the platform catalogue page loads', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/platforms' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })

  it('the search index is served as JSON', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/search-index.json' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('the health probe reports ok', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ok')
  })

  it('the version endpoint answers', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/version' })
    expect(res.statusCode).toBe(200)
  })

  it('sidebar entries derived from filenames are capitalized', async () => {
    // The per-directory sidebar groups label each entry from its filename
    // (strip .md, dashes → spaces). The first letter must be upper-cased so
    // the rail reads "Adapter lifecycle", not "adapter lifecycle".
    const guidesDir = mkdtempSync(join(tmpdir(), 'oi-guides-'))
    mkdirSync(join(guidesDir, 'architecture'))
    writeFileSync(join(guidesDir, 'architecture', 'adapter-lifecycle.md'), '# Adapter lifecycle\n')
    const server = await buildServer({ docsDir: dir, guidesDir })
    await server.ready()
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/guides/architecture/adapter-lifecycle.md',
      })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('>Adapter lifecycle</a>')
      expect(res.body).not.toContain('>adapter lifecycle</a>')
    } finally {
      await server.close()
      rmSync(guidesDir, { recursive: true, force: true })
    }
  })

  it('heading anchors match GitHub, h4 included, so a cross-page #link lands on both', async () => {
    // The docs are link-checked against GitHub. The old slugs dropped `_`,
    // collapsed "a + b" to one hyphen and gave h4 no id at all, so links such
    // as dev-api.md#sync-schedules (an h4) landed at the top of the page here.
    const guidesDir = mkdtempSync(join(tmpdir(), 'oi-guides-'))
    writeFileSync(
      join(guidesDir, 'page.md'),
      [
        '# Page',
        '## 7. Data store, `?is_live=true`, and `/sync`',
        '### Backup + restore',
        '#### Sync schedules',
        '',
      ].join('\n'),
    )
    const server = await buildServer({ docsDir: dir, guidesDir })
    await server.ready()
    try {
      const res = await server.inject({ method: 'GET', url: '/guides/page.md' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('id="7-data-store-is_livetrue-and-sync"')
      expect(res.body).toContain('id="backup--restore"')
      expect(res.body).toContain('id="sync-schedules"')
    } finally {
      await server.close()
      rmSync(guidesDir, { recursive: true, force: true })
    }
  })
})

/**
 * The two API reference pages — Unified API and Operator API — share one
 * shell. The Operator API used to be a
 * bare Swagger mount — no sidebar, no filter, no tag rail — so it looked
 * like a different product from /unified-api one tab over. Both now render
 * through renderSwaggerReference; these pin the parts an operator sees.
 */
describe('Journey: An operator reads the Operator API the way a developer reads the Unified API', () => {
  it('the operator page carries the same sidebar shell as the developer page', async () => {
    const dev = await fastify.inject({ method: 'GET', url: '/unified-api' })
    const op = await fastify.inject({ method: 'GET', url: '/operator-api' })
    expect(op.statusCode).toBe(200)
    for (const marker of [
      'class="api-ref-shell"',
      'data-rail',
      'data-rail-tags',
      'data-rail-ops',
      'data-filter',
    ]) {
      expect(dev.body).toContain(marker)
      expect(op.body).toContain(marker)
    }
  })

  it('the operator page loads the admin-api spec and is titled as such', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/operator-api' })
    expect(res.body).toContain('Operator API - Documentation - OpenSteward')
    expect(res.body).toContain("url: '/specs/admin-api.openapi.json'")
    expect(res.body).toContain('href="/specs/admin-api.openapi.json"')
  })

  it('names its groups as sections, not verticals, and wires no adapter cascade', async () => {
    // admin-api's tags are resources (Users, Runtime settings, Audit…). The
    // cascade reads /specs/platform-slugs.json for `vertical`/`platform`
    // parameters this API does not have.
    const res = await fastify.inject({ method: 'GET', url: '/operator-api' })
    expect(res.body).toContain('Sections')
    expect(res.body).toContain('Pick a section to list operations.')
    expect(res.body).not.toContain('/specs/platform-slugs.json')
  })

  it('the developer page keeps its verticals and its cascade', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/unified-api' })
    expect(res.body).toContain('Verticals')
    expect(res.body).toContain('/specs/platform-slugs.json')
  })
})
