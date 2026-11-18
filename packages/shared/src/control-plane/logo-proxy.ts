/**
 * Serves platform logos at `/data/platforms/logos/<slug>.<svg|png>` on both the
 * admin and docs-server, from whichever source has them.
 *
 * The URL is the one `@opensteward/platforms-ui` probes: `.svg`, then `.png`,
 * then a monogram fallback.
 *
 * Resolution order, and why:
 *   1. In-process LRU — a catalog page requests 100+ logos at once.
 *   2. The admin-api manifest. If a slug/ext pair is not in it, we skip
 *      admin-api entirely and go to disk. This is the point of the manifest: a
 *      deployment using the CLI-to-disk workflow has an empty one, so it never
 *      pays a round trip. Without it every one of 1,545 logos would eat a 404
 *      round trip before falling back.
 *   3. admin-api's public byte endpoint (logos fetched from the admin UI).
 *   4. The on-disk directory (logos fetched with the CLI).
 *   5. 404, which is what lets the monogram fallback fire.
 *
 * Fail-open throughout, like HostInfoFetcher: an unreachable admin-api degrades
 * to disk-then-monogram rather than breaking the page.
 *
 * The route always exists, so a logo directory appearing after start-up is
 * served without a restart.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

/**
 * `<slug>.<ext>`. All 1,545 catalog slugs match `^[a-z0-9][a-z0-9-]*$`, so this
 * is also the path-traversal guard for the disk branch — no `..`, no `/`, and
 * no absolute path survives it.
 */
const LOGO_FILE = /^([a-z0-9][a-z0-9-]*)\.(svg|png)$/

const CONTENT_TYPE: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
}

export interface LogoProxyOptions {
  /** Defaults to `process.env.ADMIN_API_URL`. Null disables the DB branch. */
  adminApiUrl?: string | null
  /** On-disk fallback directory, e.g. `<docs>/platforms/logos`. */
  diskRoot?: string | null
  /** Manifest cache TTL. Default 60s. */
  manifestTtlMs?: number
  /** Max logos held in memory. Default 256. */
  byteCacheMaxEntries?: number
  /** Per-entry byte cache TTL. Default 5 minutes. */
  byteCacheTtlMs?: number
  /** URL prefix to register under. Default `/data/platforms/logos/`. */
  prefix?: string
  fetchImpl?: typeof fetch
}

interface CachedBytes {
  bytes: Buffer
  contentType: string
  etag: string
  expiresAt: number
}

export function registerLogoProxy(fastify: FastifyInstance, opts: LogoProxyOptions = {}): void {
  const rawUrl = opts.adminApiUrl ?? process.env['ADMIN_API_URL'] ?? null
  const adminApiUrl = rawUrl ? rawUrl.replace(/\/$/, '') : null
  const diskRoot = opts.diskRoot ?? null
  const manifestTtlMs = opts.manifestTtlMs ?? 60_000
  const maxEntries = opts.byteCacheMaxEntries ?? 256
  const byteTtlMs = opts.byteCacheTtlMs ?? 300_000
  const prefix = opts.prefix ?? '/data/platforms/logos/'
  const doFetch = opts.fetchImpl ?? globalThis.fetch

  const byteCache = new Map<string, CachedBytes>()
  let manifest: { value: Record<string, string[]>; expiresAt: number } | null = null

  async function getManifest(): Promise<Record<string, string[]>> {
    if (!adminApiUrl) return {}
    const now = Date.now()
    if (manifest && manifest.expiresAt > now) return manifest.value
    try {
      const res = await doFetch(`${adminApiUrl}/data/platform-logos/manifest.json`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok) {
        // Short negative cache so an admin-api blip does not hot-loop.
        manifest = { value: {}, expiresAt: now + Math.min(manifestTtlMs, 5_000) }
        return manifest.value
      }
      const body = (await res.json()) as { logos?: Record<string, string[]> }
      manifest = { value: body.logos ?? {}, expiresAt: now + manifestTtlMs }
      return manifest.value
    } catch {
      manifest = { value: {}, expiresAt: now + Math.min(manifestTtlMs, 5_000) }
      return manifest.value
    }
  }

  function remember(key: string, entry: CachedBytes): void {
    // Insertion-ordered eviction — good enough for a bounded set of small
    // assets, and cheaper than tracking recency.
    if (byteCache.size >= maxEntries) {
      const oldest = byteCache.keys().next().value
      if (oldest !== undefined) byteCache.delete(oldest)
    }
    byteCache.set(key, entry)
  }

  // No `schema: { hide: true }` here, unlike admin-api's byte endpoint: the two
  // consumers (admin, docs-server) do not generate an OpenAPI spec from their
  // own routes, and `hide` is a @fastify/swagger type augmentation this package
  // does not load.
  fastify.get<{ Params: { file: string } }>(`${prefix}:file`, async (request, reply) => {
    const match = LOGO_FILE.exec(request.params.file)
    // 404 for a malformed name too: platforms-ui only needs "nothing here"
    // to run its fallback chain, and a 400 would leak that the name was
    // parseable but absent.
    if (!match) return reply.code(404).send()
    const [, slug, ext] = match
    const key = `${slug}.${ext}`

    const send = (entry: CachedBytes) => {
      reply
        .header('etag', entry.etag)
        .header('cache-control', 'public, max-age=300, stale-while-revalidate=86400')
        .header('x-content-type-options', 'nosniff')
        .type(entry.contentType)
      // Answer conditional requests locally so the browser cache, not this
      // process, carries the load.
      const inm = request.headers['if-none-match']
      const raw = Array.isArray(inm) ? inm.join(',') : inm
      if (
        raw &&
        raw.split(',').some((t) => t.trim() === entry.etag || t.trim() === `W/${entry.etag}`)
      ) {
        return reply.code(304).send()
      }
      return reply.send(entry.bytes)
    }

    const now = Date.now()
    const hit = byteCache.get(key)
    if (hit && hit.expiresAt > now) return send(hit)

    const available = await getManifest()
    if (adminApiUrl && available[slug]?.includes(ext)) {
      try {
        const res = await doFetch(`${adminApiUrl}/data/platform-logos/${key}`)
        if (res.ok) {
          const bytes = Buffer.from(await res.arrayBuffer())
          const entry: CachedBytes = {
            bytes,
            contentType: res.headers.get('content-type') ?? CONTENT_TYPE[ext],
            etag: res.headers.get('etag') ?? `"${slug}-${bytes.length}"`,
            expiresAt: now + byteTtlMs,
          }
          remember(key, entry)
          return send(entry)
        }
      } catch {
        // Fall through to disk — an unreachable admin-api must not blank
        // logos an operator already has on disk.
      }
    }

    if (diskRoot) {
      try {
        const bytes = await readFile(join(diskRoot, key))
        const entry: CachedBytes = {
          bytes,
          contentType: CONTENT_TYPE[ext],
          etag: `"${key}-${bytes.length}"`,
          expiresAt: now + byteTtlMs,
        }
        remember(key, entry)
        return send(entry)
      } catch {
        // ENOENT is the normal case for a platform with no logo.
      }
    }

    return reply.code(404).send()
  })
}
