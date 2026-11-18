#!/usr/bin/env tsx
/**
 * Builds `docs/openapi/admin-api.openapi.json` from the live admin-api
 * route registry. This is a PIPELINE — every byte of OpenAPI content
 * comes out of the Fastify routes' Zod `schema:` options via
 * `@fastify/swagger`'s `app.swagger()`. We never author OpenAPI by hand
 * at any layer here.
 *
 * The script also serves as a lint gate: every registered route MUST
 * carry an `operationId` of the form `<group>.<action>`. Anything
 * missing one fails the generator (and CI), so the SDK + CLI
 * generators have a stable, deterministic input.
 *
 * Usage: `pnpm --filter admin-api generate:openapi` (also wired as
 * `pnpm docs:admin-api-openapi` at the repo root and chained into
 * `pnpm docs:all`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { buildServer } from '../src/core/server'
import type { Config } from '../src/config'
import { buildServersBlock } from '@opensteward/shared'
import { injectExamples } from './openapi-examples'

interface OpenApiOperation {
  operationId?: string
  summary?: string
  tags?: string[]
  [key: string]: unknown
}

interface OpenApiPathItem {
  [verb: string]: OpenApiOperation | undefined
}

interface OpenApiDoc {
  paths?: Record<string, OpenApiPathItem>
  [key: string]: unknown
}

// Minimal stand-in config so the generator boots without needing the
// operator-deployment env vars (JWT_SECRET / STORE_SECRET). We never
// listen on a port — this is a pure-introspection boot.
function generatorConfig(): Config {
  const placeholder = 'generator-placeholder-secret-with-enough-entropy-for-validation-only'
  return {
    server: { port: 0, host: '127.0.0.1' },
    jwt: { secret: placeholder, expiresIn: '24h' },
    // ResolvedDbConfig shape (post dual-backend). In-memory SQLite — the generator
    // boots, runs migrations, introspects every route's schema, and exits.
    db: { dialect: 'sqlite', sqlitePath: ':memory:', poolMax: 1 },
    verticals: [],
    storeSecret: placeholder,
    sso: {
      publicBaseUrl: 'http://localhost:3001',
      adminUiUrl: 'http://localhost:3000',
    },
  }
}

async function main(): Promise<void> {
  const config = generatorConfig()
  const { fastify, adminStore } = await buildServer(config, { generatorMode: true })
  try {
    // Wait until every route is registered so app.swagger() sees the
    // full surface (avvio's lazy `register` calls finish under .ready()).
    await fastify.ready()

    // `getSwagger` on the fastify-swagger plugin returns the live OpenAPI
    // document derived from every route's `schema:`. Schemas (and their
    // field-level `example`s) come straight from the Zod `schema:` options
    // — never authored by hand. The one post-process step is
    // `injectExamples` below, which ADDS named whole-body media-type
    // `examples` maps (scenarios that the Zod→OpenAPI bridge can't express)
    // without touching any schema or field example.
    const doc = (fastify as unknown as { swagger: () => OpenApiDoc }).swagger() as OpenApiDoc

    // ── Linter step ─────────────────────────────────────────────────────
    // Every operation must carry an `operationId`. Missing ones break
    // the downstream SDK + CLI generators (which key their emitted
    // command / type names off operationId). Fail loud + early.
    //
    // Universal infra paths (`/health`, `/version`, `/openapi.json`,
    // anything under `/docs/`) are excluded — they're shared
    // boilerplate that lives outside admin-api and isn't part of the
    // operator surface we're generating an SDK for.
    const INFRA_PATH_PATTERNS: RegExp[] = [
      /^\/health$/,
      /^\/version$/,
      /^\/openapi\.json$/,
      /^\/docs(\/.*)?$/,
    ]
    const isInfraPath = (p: string): boolean => INFRA_PATH_PATTERNS.some((re) => re.test(p))

    const missing: Array<{ path: string; method: string }> = []
    const allIds = new Set<string>()
    const dupes: Array<{ id: string; path: string; method: string }> = []

    for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
      if (!pathItem || typeof pathItem !== 'object') continue
      if (isInfraPath(pathKey)) continue
      for (const [verb, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue
        const httpVerbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
        if (!httpVerbs.has(verb)) continue
        const id = op.operationId
        if (!id) {
          missing.push({ path: pathKey, method: verb.toUpperCase() })
        } else if (allIds.has(id)) {
          dupes.push({ id, path: pathKey, method: verb.toUpperCase() })
        } else {
          allIds.add(id)
        }
      }
    }

    if (missing.length > 0 || dupes.length > 0) {
      if (missing.length > 0) {
        console.error('\n✗ Missing operationId on the following admin-api routes:')
        for (const { path, method } of missing) console.error(`    ${method.padEnd(7)} ${path}`)
      }
      if (dupes.length > 0) {
        console.error('\n✗ Duplicate operationId on the following admin-api routes:')
        for (const { id, path, method } of dupes) console.error(`    ${id}  ←  ${method} ${path}`)
      }
      console.error(
        '\n  Convention: <group>.<action> (e.g. `users.create`, `platforms.config.set`).\n',
      )
      process.exit(1)
    }

    // ── Named whole-body examples ───────────────────────────────────────
    // Layer in curated media-type `examples` maps (full request/response
    // bodies for concrete scenarios) onto selected operations. Runs after
    // the operationId lint, before persist. ADD-only: schemas and
    // field-level examples are untouched, so `check:openapi-examples`
    // stays unaffected.
    injectExamples(doc)

    // ── Servers ─────────────────────────────────────────────────────────
    // The spec had none at all, so Swagger UI rendered every operator route
    // with no base URL and "Try it out" had nowhere to send the request.
    //
    // Unversioned, because admin-api mounts at `/api/*` and `/scim/v2/*` with
    // no version segment — unlike the developer API, whose root server carries
    // `/{version}`. Port defaults to 3001, admin-api's own.
    //
    // Deliberately not wired to the `openapi.servers.*` runtime settings: those
    // describe the integration-server's public surface, and admin-api is
    // internal-only (docs/security/README.md §2). The variables are still
    // editable in Swagger UI for anyone fronting it with a proxy.
    doc.servers = buildServersBlock(
      { port: { default: '3001', enum: ['3001'] } },
      { variant: 'unversioned' },
    ).map((server) => ({
      ...server,
      description: 'OpenSteward admin-api (operator surface)',
    }))

    // ── Persist ─────────────────────────────────────────────────────────
    const outDir = path.resolve(__dirname, '../../../docs/openapi')
    mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'admin-api.openapi.json')
    writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n')

    const opCount = Array.from(allIds).length
    const pathCount = Object.keys(doc.paths ?? {}).length
    console.log(
      `✓ wrote ${path.relative(process.cwd(), outPath)} (${pathCount} paths, ${opCount} operations)`,
    )
  } finally {
    await fastify.close()
    adminStore.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
