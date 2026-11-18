/**
 * Which build each service is running, and what that means for an operator.
 *
 * `createVersionInfoCollector` fans out to every service's `/version` (the
 * shared `createVersionRouter`) and answers the admin's own entry in-process.
 * It backs both `/api/version-info` (the sidebar footer) and the System page,
 * so the page reads the same data the footer does without an HTTP round trip
 * to itself. Best-effort: an unreachable service is `null`, never a throw.
 *
 * `summarizeSystem` turns that into what an operator who installs published
 * releases asks: which release am I on, is every service up, and did my last
 * upgrade finish (every service on the same release). Per-service package
 * versions, Git SHAs and build times are developer detail; they survive only
 * in `bugReportText` and the page's collapsed Technical details.
 */
import { readBuildTime, readGitSha, readRelease } from '@opensteward/shared'

export const SERVICE_KEYS = [
  'admin',
  'admin-api',
  'integration-server',
  'docs-server',
  'webhook-gateway',
] as const
export type ServiceKey = (typeof SERVICE_KEYS)[number]

const SERVICE_NAMES: Record<ServiceKey, string> = {
  admin: 'Admin console',
  'admin-api': 'Admin API',
  'integration-server': 'Integration server',
  'docs-server': 'Docs',
  'webhook-gateway': 'Webhook gateway',
}

/** One service's `/version` payload. `release` is absent on builds that predate it. */
export interface VersionEntry {
  name: string
  version: string
  release?: string
  gitSha: string
  buildTime: string
}

export type VersionInfo = Record<ServiceKey, VersionEntry | null>

const REPO_URL = 'https://github.com/open-steward/opensteward'

function base(url: string): string {
  return url.replace(/\/+$/, '')
}

/** A `/version` body, or null when it is not one. Other services are trusted
 *  only as far as their shape: every field is read as a string. */
function asEntry(body: unknown): VersionEntry | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)
  return {
    name: str(b['name'], 'unknown'),
    version: str(b['version'], 'unknown'),
    ...(typeof b['release'] === 'string' && b['release'] ? { release: b['release'] } : {}),
    gitSha: str(b['gitSha'], 'dev'),
    buildTime: str(b['buildTime'], 'dev'),
  }
}

async function fetchVersion(url: string): Promise<VersionEntry | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
    if (!res.ok) return null
    return asEntry(await res.json())
  } catch {
    return null
  }
}

export interface VersionInfoCollectorOptions {
  /** admin-api's base URL (the admin's configured one; `ADMIN_API_URL` wins). */
  adminApiUrl: string
  /** The admin app's own package.json. */
  pkg: { name?: string; version?: string }
}

export function createVersionInfoCollector(
  opts: VersionInfoCollectorOptions,
): () => Promise<VersionInfo> {
  const urls: Record<Exclude<ServiceKey, 'admin'>, string> = {
    'admin-api': `${base(process.env['ADMIN_API_URL'] ?? opts.adminApiUrl)}/version`,
    'integration-server': `${base(process.env['INTEGRATION_SERVER_URL'] ?? 'http://integration-server:3010')}/version`,
    'docs-server': `${base(process.env['DOCS_SERVER_INTERNAL_URL'] ?? 'http://docs-server:3003')}/version`,
    'webhook-gateway': `${base(process.env['WEBHOOK_GATEWAY_URL'] ?? 'http://webhook-gateway:3004')}/version`,
  }
  return async () => {
    const [adminApi, integrationServer, docsServer, webhookGateway] = await Promise.all([
      fetchVersion(urls['admin-api']),
      fetchVersion(urls['integration-server']),
      fetchVersion(urls['docs-server']),
      fetchVersion(urls['webhook-gateway']),
    ])
    return {
      admin: {
        name: opts.pkg.name ?? 'admin',
        version: opts.pkg.version ?? '0.0.0',
        release: readRelease(),
        gitSha: readGitSha(),
        buildTime: readBuildTime(),
      },
      'admin-api': adminApi,
      'integration-server': integrationServer,
      'docs-server': docsServer,
      'webhook-gateway': webhookGateway,
    }
  }
}

export interface ServiceSummary {
  key: ServiceKey
  name: string
  running: boolean
  /** The release it reports; `'unknown'` for a build that predates the field. Null when not running. */
  release: string | null
}

export interface SystemSummary {
  /** The release every running service agrees on; null when they disagree. */
  release: string | null
  /** Distinct releases across running services, sorted. More than one means `mismatch`. */
  releases: string[]
  mismatch: boolean
  /** Every running service was built from source (`GIT_SHA` unset), not a published image. */
  devBuild: boolean
  services: ServiceSummary[]
  notResponding: ServiceSummary[]
  releaseNotesUrl: string
  releasesUrl: string
  /** Plain text for an issue's Version field: every service's build detail. */
  bugReportText: string
}

export function summarizeSystem(info: VersionInfo): SystemSummary {
  const services: ServiceSummary[] = SERVICE_KEYS.map((key) => {
    const entry = info[key]
    return {
      key,
      name: SERVICE_NAMES[key],
      running: entry !== null,
      release: entry ? (entry.release ?? 'unknown') : null,
    }
  })
  const running = services.filter((s) => s.running)
  const releases = [...new Set(running.map((s) => s.release as string))].sort()
  const mismatch = releases.length > 1
  const release = releases.length === 1 ? releases[0] : null
  const entries = SERVICE_KEYS.map((k) => info[k]).filter((e): e is VersionEntry => e !== null)
  const devBuild = entries.length > 0 && entries.every((e) => e.gitSha === 'dev')

  const headline = `OpenSteward ${release ?? (mismatch ? releases.join(' / ') : 'unknown')}${devBuild ? ' (development build)' : ''}`
  const lines = SERVICE_KEYS.map((key) => {
    const e = info[key]
    return e
      ? `${key}: release ${e.release ?? 'unknown'}, version ${e.version}, git ${e.gitSha}, built ${e.buildTime}`
      : `${key}: not responding`
  })

  return {
    release,
    releases,
    mismatch,
    devBuild,
    services,
    notResponding: services.filter((s) => !s.running),
    // A development build has no release page of its own; its changes are
    // whatever main's CHANGELOG says since the last tag.
    releaseNotesUrl:
      release && release !== 'unknown' && !devBuild
        ? `${REPO_URL}/releases/tag/${encodeURIComponent(`platform/v${release}`)}`
        : `${REPO_URL}/blob/main/CHANGELOG.md`,
    releasesUrl: `${REPO_URL}/releases`,
    bugReportText: [headline, ...lines].join('\n'),
  }
}
