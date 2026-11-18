/**
 * Build-info probe. Each service registers `/version` next to `/health`
 * so operators can confirm which release + git SHA is actually running
 * — answering the "did my pull + rebuild take effect?" question without
 * `docker exec`.
 *
 * The response shape is intentionally small and stable:
 *
 *     { name, version, release, gitSha, buildTime }
 *
 * - `release` is the OpenSteward release this build belongs to — the
 *   repo-level `VERSION` file that `scripts/release.ts` bumps, the Helm
 *   chart pins and `images.yml` tags (`platform/v<release>`). It is the
 *   one number an operator upgrades between; see `readRelease()`.
 * - `name` and `version` come from the calling app's `package.json`.
 *   The caller passes them in; this plugin doesn't read the disk so it
 *   stays trivially testable.
 * - `gitSha` reads `process.env.GIT_SHA` and defaults to `"dev"` when
 *   unset. The expected wiring is `ARG GIT_SHA` in each app's Dockerfile
 *   plus `ENV GIT_SHA=$GIT_SHA`; docker-compose forwards the value from
 *   the operator's shell or `.env`.
 * - `buildTime` reads `process.env.BUILD_TIME` (an ISO timestamp baked
 *   at image-build time via the same ARG mechanism). Defaults to `"dev"`.
 *
 * Local dev (no ARGs, no env exported) returns `gitSha: "dev"` and
 * `buildTime: "dev"` — never throws, never undefined.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'

export interface VersionRouterOptions {
  /** Human-friendly service name. Usually the app's package.json `name`. */
  name: string
  /** Semver version string. Usually the app's package.json `version`. */
  version: string
}

export interface VersionPayload {
  name: string
  version: string
  release: string
  gitSha: string
  buildTime: string
}

/** A `VERSION` file's content: a bare semver, optionally with a pre-release or build suffix. */
const RELEASE_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

const releaseFileCache = new Map<string, string>()

/**
 * The OpenSteward release this build belongs to, or `"unknown"`.
 *
 * In order: `OPENSTEWARD_RELEASE`; else the first `VERSION` file found from
 * `startDir` upwards. Images copy the repo's `VERSION` to `/app/VERSION`,
 * which is the working directory, so the first step up finds it; a local
 * `pnpm dev` from `apps/<app>` walks up to the repo root's copy. A file whose
 * content is not a version (some unrelated `VERSION`) is skipped rather than
 * reported. Never throws.
 *
 * The file lookup is cached per directory — `/version` is polled by the admin
 * sidebar on every page load — while the env override is read every call.
 */
export function readRelease(startDir: string = process.cwd()): string {
  const fromEnv = process.env['OPENSTEWARD_RELEASE']?.trim()
  if (fromEnv) return fromEnv

  const cached = releaseFileCache.get(startDir)
  if (cached !== undefined) return cached

  let found = 'unknown'
  let dir = startDir
  for (;;) {
    const candidate = join(dir, 'VERSION')
    try {
      if (existsSync(candidate)) {
        const value = readFileSync(candidate, 'utf8').trim()
        if (RELEASE_PATTERN.test(value)) {
          found = value
          break
        }
      }
    } catch {
      // Unreadable: keep walking. `/version` must answer regardless.
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  releaseFileCache.set(startDir, found)
  return found
}

/**
 * Read the git SHA from the environment, falling back to `"dev"`.
 * Exported separately so non-Fastify callers (CLI, tests) can reuse it.
 */
export function readGitSha(): string {
  const raw = process.env['GIT_SHA']
  return raw && raw.length > 0 ? raw : 'dev'
}

/**
 * Read the build time from the environment, falling back to `"dev"`.
 */
export function readBuildTime(): string {
  const raw = process.env['BUILD_TIME']
  return raw && raw.length > 0 ? raw : 'dev'
}

export function createVersionRouter(opts: VersionRouterOptions): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/version', async (): Promise<VersionPayload> => ({
      name: opts.name,
      version: opts.version,
      release: readRelease(),
      gitSha: readGitSha(),
      buildTime: readBuildTime(),
    }))
  }
}
