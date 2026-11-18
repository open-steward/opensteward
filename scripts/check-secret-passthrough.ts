/**
 * CI guard: every secret this repo generates must actually reach the service
 * that reads it.
 *
 * A secret can be generated, documented, set by the operator — and silently
 * never forwarded into the container, leaving the control it guards
 * permanently off:
 *
 *   - ADMIN_SECRET missing from admin-api's compose `environment:` block
 *     makes every admin passthrough 403. Under NODE_ENV!=production it is
 *     worse than invisible: integration-server's adminGuard falls open when
 *     the value is unset.
 *   - BOOTSTRAP_TOKEN: same shape, worse effect. `auth.ts` only demands
 *     `X-Bootstrap-Token` on `POST /api/auth/setup` `if (opts.bootstrapToken)`,
 *     so if the variable never reaches the container the first-run gate is
 *     off no matter what the operator generated — anyone reaching published
 *     :3001 before setup completes can claim the admin account.
 *
 * No single file reveals this: the generator, the reader and the compose file
 * are each correct on their own. This check is the join.
 *
 * Rule: for every `VAR=$(gen)` in `scripts/generate-secrets.sh`, look up which
 * apps read it (from the generated `read by:` annotations in `.env.example`),
 * and require `docker-compose.yml` to forward it to each of those apps'
 * services. A secret read only by `packages/shared` is service-agnostic and
 * only needs to reach one service.
 *
 * A second rule covers operator KNOBS — non-secret settings a service reads
 * from its own `src/config.ts`. A knob documented in `.env.example` but not
 * forwarded by compose has no effect: the value in the mounted config.yml
 * wins unconditionally (e.g. RATE_LIMIT_MAX vs config.yml's 100 requests a
 * minute), so an operator raising the limit in `.env` sees no change. That
 * is the same defect as the secrets above with a different blast radius: the
 * admin UI throttles itself and the documented remedy does nothing.
 *
 * A third rule pins variables that must reach exactly the named services,
 * whatever `.env.example`'s `read by:` lines happen to say. The two rules
 * above infer readers from where the read sits, so a license read moved into
 * packages/shared would satisfy both with the forward deleted.
 * REQUIRED_PASSTHROUGH's `exclusive` also forbids every other service, under
 * the same name or another (`LICENSE_TOKEN=${OPENSTEWARD_LICENSE}`), and
 * denies every other service an `env_file:`, which hands the container
 * whatever that file sets (`env_file: .env` is the operator's whole .env,
 * license included) without one `environment:` line naming it.
 * integration-server is the single license authority (D-A), and a second copy
 * of the license in another container is a second, divergent authority. The
 * exclusivity holds in every root overlay too (docker-compose.<name>.yml),
 * since an operator layers them on the base; the forward itself is required
 * of docker-compose.yml alone.
 *
 * Run: `pnpm tsx scripts/check-secret-passthrough.ts` (add `--soft` to report
 * only).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const REPO_ROOT = join(import.meta.dirname, '..')

/** `SESSION_SECRET=$(gen)` → `SESSION_SECRET`. Only `$(gen)` counts: those are
 *  the values the script mints for the operator, i.e. the ones that are
 *  useless if they never arrive. */
export function parseGeneratedSecrets(shSource: string): string[] {
  const names: string[] = []
  for (const line of shSource.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=\$\(gen\)\s*$/.exec(line.trim())
    if (m?.[1]) names.push(m[1])
  }
  return names
}

/**
 * Which apps read a variable, from `.env.example`'s generated `read by:` lines.
 * Returns workspace paths (`apps/admin-api`, `packages/shared`), deduped.
 */
export function parseEnvReaders(envExample: string): Map<string, string[]> {
  const readers = new Map<string, string[]>()
  const lines = envExample.split('\n')
  let current: string | null = null
  for (const line of lines) {
    const header = /^#\s+([A-Z][A-Z0-9_]*)\s+—/.exec(line)
    if (header?.[1]) {
      current = header[1]
      continue
    }
    const readBy = /^#\s+read by:\s*(.+)$/.exec(line)
    if (readBy?.[1] && current) {
      const workspaces = new Set<string>()
      for (const path of readBy[1].split(',')) {
        const m = /^((?:apps|packages)\/[^/]+)\//.exec(path.trim())
        if (m?.[1]) workspaces.add(m[1])
      }
      readers.set(current, [...workspaces])
    }
  }
  return readers
}

/** service name → set of env var names it interpolates from the host env. */
export function parseComposeEnv(composeSource: string): Map<string, Set<string>> {
  const doc = load(composeSource) as {
    services?: Record<string, { environment?: string[] | Record<string, string> }>
  }
  const byService = new Map<string, Set<string>>()
  for (const [service, def] of Object.entries(doc.services ?? {})) {
    const vars = new Set<string>()
    const env = def?.environment
    const entries = Array.isArray(env)
      ? env
      : Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`)
    for (const entry of entries) {
      // `- ADMIN_SECRET=${ADMIN_SECRET:-}` — record the interpolated host var,
      // not the container-side name: forwarding `FOO=${BAR}` passes BAR's value.
      for (const m of String(entry).matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)) {
        if (m[1]) vars.add(m[1])
      }
    }
    byService.set(service, vars)
  }
  return byService
}

/** `apps/admin-api` → `admin-api`. Compose service names match the app dirs. */
function serviceForWorkspace(workspace: string): string | null {
  const m = /^apps\/(.+)$/.exec(workspace)
  return m?.[1] ?? null
}

export interface PassthroughGap {
  secret: string
  service: string
  reason: string
  /** `missing`: never reaches a service that needs it. `exclusive`: reaches one that must not have it. */
  kind: 'missing' | 'exclusive'
}

export function findPassthroughGaps(
  generated: string[],
  readers: Map<string, string[]>,
  compose: Map<string, Set<string>>,
): PassthroughGap[] {
  const gaps: PassthroughGap[] = []
  for (const secret of generated) {
    const workspaces = readers.get(secret) ?? []
    const services = workspaces
      .map(serviceForWorkspace)
      .filter((s): s is string => s !== null && compose.has(s))

    if (services.length === 0) {
      // Read only by packages/shared (or by nothing .env.example knows about):
      // it is not tied to one service, so require it to reach at least one.
      const anywhere = [...compose.values()].some((vars) => vars.has(secret))
      if (!anywhere) {
        gaps.push({
          secret,
          service: '(any)',
          reason: 'generated by scripts/generate-secrets.sh but no service forwards it',
          kind: 'missing',
        })
      }
      continue
    }

    for (const service of services) {
      if (!compose.get(service)?.has(secret)) {
        gaps.push({
          secret,
          service,
          reason: `read by apps/${service} but missing from its docker-compose.yml environment block`,
          kind: 'missing',
        })
      }
    }
  }
  return gaps
}

/**
 * service name → set of variable names the container receives, whatever the
 * value's origin. `- ADMIN_API_URL=http://admin-api:3001` counts here but not
 * in `parseComposeEnv`, which tracks only values interpolated from the host
 * env. The distinction matters: a secret must reach the container *from the
 * operator's .env*, while a knob only has to arrive.
 */
export function parseComposeEnvNames(composeSource: string): Map<string, Set<string>> {
  const doc = load(composeSource) as {
    services?: Record<string, { environment?: string[] | Record<string, string> }>
  }
  const byService = new Map<string, Set<string>>()
  for (const [service, def] of Object.entries(doc.services ?? {})) {
    const names = new Set<string>()
    const env = def?.environment
    const entries = Array.isArray(env) ? env : Object.keys(env ?? {})
    for (const entry of entries) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*[=:]?/.exec(String(entry))
      if (m?.[1]) names.add(m[1])
    }
    byService.set(service, names)
  }
  return byService
}

/**
 * Settings a service reads from its own config loader that compose is not
 * expected to forward, with the reason. Everything else read from
 * `apps/<svc>/src/config.ts` and documented in `.env.example` must reach that
 * service.
 */
const KNOB_EXEMPTIONS: Record<string, string> = {
  CONFIG_PATH: 'the image fixes the config path; the mount decides the content',
  HOST: 'the container always binds 0.0.0.0',
  PORT: 'fixed by the image and the compose ports mapping',
  STORE_PATH: 'fixed by the named volume mount',
  DATA_STORE_PATH: 'fixed by the named volume mount',
}

/** Env vars a service's own config loader reads. */
export function parseConfigLoaderVars(configSource: string): string[] {
  const names = new Set<string>()
  // Both access forms appear in these loaders: `process.env.PORT` and
  // `process.env['RATE_LIMIT_MAX']`.
  for (const m of configSource.matchAll(/process\.env(?:\.|\[['"]?)([A-Z][A-Z0-9_]*)/g)) {
    if (m[1]) names.add(m[1])
  }
  return [...names]
}

export function findKnobGaps(
  service: string,
  configVars: string[],
  documented: Set<string>,
  composeNames: Map<string, Set<string>>,
): PassthroughGap[] {
  const forwarded = composeNames.get(service)
  if (!forwarded) return []
  return configVars
    .filter((v) => documented.has(v) && !forwarded.has(v) && !KNOB_EXEMPTIONS[v])
    .map((v) => ({
      secret: v,
      service,
      reason: `read by apps/${service}/src/config.ts and documented in .env.example, but docker-compose.yml never forwards it — the documented knob has no effect`,
      kind: 'missing' as const,
    }))
}

/**
 * service name → the files its `env_file:` loads (a string, a list of strings,
 * or a list of `{ path, required }`). Services without one are absent.
 */
export function parseComposeEnvFiles(composeSource: string): Map<string, string[]> {
  const doc = load(composeSource) as {
    services?: Record<string, { env_file?: unknown } | null>
  }
  const byService = new Map<string, string[]>()
  for (const [service, def] of Object.entries(doc.services ?? {})) {
    const raw = def?.env_file
    if (raw === undefined || raw === null) continue
    const files = (Array.isArray(raw) ? raw : [raw]).map((f) =>
      typeof f === 'object' && f !== null
        ? String((f as { path?: unknown }).path ?? '')
        : String(f),
    )
    byService.set(service, files)
  }
  return byService
}

/** Variables that must reach exactly these services (rule three). */
export const REQUIRED_PASSTHROUGH: Record<
  string,
  { services: string[]; exclusive: boolean; reason: string }
> = {
  OPENSTEWARD_LICENSE: {
    services: ['integration-server'],
    exclusive: true,
    reason:
      'the license token; without the forward a licensed install silently runs in community mode',
  },
  OPENSTEWARD_LICENSE_FILE: {
    services: ['integration-server'],
    exclusive: true,
    reason: 'the license file path; without the forward the mounted license is never read',
  },
}

/**
 * Rule three. `interpolated` (parseComposeEnv) says which host variables a
 * service forwards from .env; `names` (parseComposeEnvNames) which variables
 * the container receives at all. A required service must interpolate the
 * variable, so a literal `OPENSTEWARD_LICENSE=` does not count. An exclusive
 * variable must reach no other service, under its own name, as the value of
 * another one, or through an `env_file:` (`envFiles`, parseComposeEnvFiles):
 * the files are the operator's, so whether one sets the variable is unknowable
 * here, and any env_file on another service counts. Each offending service is
 * reported once per variable.
 */
export function findRequiredPassthroughGaps(
  required: typeof REQUIRED_PASSTHROUGH,
  interpolated: Map<string, Set<string>>,
  names: Map<string, Set<string>>,
  envFiles: Map<string, string[]> = new Map(),
): PassthroughGap[] {
  const gaps: PassthroughGap[] = []
  for (const [name, rule] of Object.entries(required)) {
    for (const service of rule.services) {
      if (!interpolated.get(service)?.has(name))
        gaps.push({
          secret: name,
          service,
          reason: `must be forwarded from .env to ${service} as \${${name}:-…}: ${rule.reason}`,
          kind: 'missing',
        })
    }
    if (!rule.exclusive) continue
    const services = new Set([...names.keys(), ...interpolated.keys(), ...envFiles.keys()])
    for (const service of services) {
      if (rule.services.includes(service)) continue
      const only = `only ${rule.services.join(', ')} may receive it (single license authority)`
      if (names.get(service)?.has(name) || interpolated.get(service)?.has(name)) {
        gaps.push({
          secret: name,
          service,
          reason: `forwarded to ${service}, but ${only}`,
          kind: 'exclusive',
        })
      } else if (envFiles.has(service)) {
        gaps.push({
          secret: name,
          service,
          reason: `${service} loads env_file ${envFiles.get(service)!.join(', ')}, which hands it ${name} whenever that file sets it, but ${only}; forward what ${service} needs in \`environment:\` instead`,
          kind: 'exclusive',
        })
      }
    }
  }
  return gaps
}

/**
 * Rule three's exclusivity over an overlay (`docker-compose.<name>.yml`). An
 * operator layers overlays on the base file, so one that hands a pinned
 * variable to another service, by `environment:` or `env_file:`, is a second
 * license authority all the same. The forward is required of the base file
 * alone, since an overlay is optional, so only `exclusive` gaps count here.
 * Compose's merge tags (`!reset`, `!override`) are dropped before parsing.
 */
export function findOverlayExclusiveGaps(
  file: string,
  source: string,
  required: typeof REQUIRED_PASSTHROUGH = REQUIRED_PASSTHROUGH,
): PassthroughGap[] {
  const src = source.replace(/(:[ \t]*)!(?:reset|override)\b/g, '$1')
  // Nothing but comments is an empty overlay (js-yaml throws on an empty document).
  if (!/^[ \t]*[^#\s]/m.test(src) || !load(src)) return []
  return findRequiredPassthroughGaps(
    required,
    parseComposeEnv(src),
    parseComposeEnvNames(src),
    parseComposeEnvFiles(src),
  )
    .filter((g) => g.kind === 'exclusive')
    .map((g) => ({ ...g, reason: `${file}: ${g.reason}` }))
}

/**
 * What the gate prints, split by stream: a status line per generated secret
 * (rule one) and per pinned variable (rule three), then either one success
 * line naming all three rules or a section per kind of gap. A variable that
 * reaches a service it must not is the opposite problem from one that never
 * arrives, so the two get their own header and remedy.
 */
export function formatReport(input: {
  generated: string[]
  readers: Map<string, string[]>
  gaps: PassthroughGap[]
  required: typeof REQUIRED_PASSTHROUGH
  /** How many of `gaps` are rule-two knobs. */
  knobGaps?: number
}): { stdout: string[]; stderr: string[] } {
  const { generated, readers, gaps, required, knobGaps = 0 } = input
  const stdout: string[] = []
  const stderr: string[] = []
  const mark = (name: string) => (gaps.some((g) => g.secret === name) ? '✖' : '✓')
  for (const secret of generated) {
    const workspaces = readers.get(secret) ?? []
    stdout.push(`  ${mark(secret)} ${secret} → ${workspaces.join(', ') || '(no reader found)'}`)
  }
  for (const [name, rule] of Object.entries(required)) {
    stdout.push(
      `  ${mark(name)} ${name} → ${rule.services.join(', ')}${rule.exclusive ? ' only' : ''}`,
    )
  }
  if (knobGaps > 0) stdout.push(`\n  ${knobGaps} operator knob(s) documented but never forwarded.`)

  const missing = gaps.filter((g) => g.kind === 'missing')
  const exclusive = gaps.filter((g) => g.kind === 'exclusive')
  if (missing.length > 0) {
    stderr.push(`\n✖ ${missing.length} variable(s) never reach their service:`)
    for (const g of missing) stderr.push(`  - ${g.secret}: ${g.reason}`)
    stderr.push(
      "\nAdd the variable to that service's `environment:` block in docker-compose.yml,\n" +
        'e.g. `- BOOTSTRAP_TOKEN=${BOOTSTRAP_TOKEN:-}`.',
    )
  }
  if (exclusive.length > 0) {
    stderr.push(`\n✖ ${exclusive.length} variable(s) reach a service that must not receive them:`)
    for (const g of exclusive) stderr.push(`  - ${g.secret} (${g.service}): ${g.reason}`)
    stderr.push(
      '\nA variable "only <service> may receive" goes in that service alone: remove it from the other one, and give the other one no env_file.',
    )
  }
  if (gaps.length === 0) {
    // Group the pinned variables by where they must go: "A, B reach x and no other service".
    const byTarget = new Map<string, string[]>()
    for (const [name, rule] of Object.entries(required)) {
      const where = `${rule.services.join(', ')}${rule.exclusive ? ' and no other service' : ''}`
      byTarget.set(where, [...(byTarget.get(where) ?? []), name])
    }
    const pinned = [...byTarget]
      .map(
        ([where, names]) => `${names.join(', ')} reach${names.length === 1 ? 'es' : ''} ${where}`,
      )
      .join('; ')
    stdout.push(
      `\n✓ Every generated secret reaches the service that reads it, every documented knob is forwarded, and ${pinned}.`,
    )
  }
  return { stdout, stderr }
}

function main(): void {
  const soft = process.argv.includes('--soft')
  const generated = parseGeneratedSecrets(
    readFileSync(join(REPO_ROOT, 'scripts/generate-secrets.sh'), 'utf8'),
  )
  const readers = parseEnvReaders(readFileSync(join(REPO_ROOT, '.env.example'), 'utf8'))
  const composeSource = readFileSync(join(REPO_ROOT, 'docker-compose.yml'), 'utf8')
  const compose = parseComposeEnv(composeSource)

  console.log(`Checking ${generated.length} generated secret(s) reach the services that read them.`)
  const gaps = findPassthroughGaps(generated, readers, compose)

  // Second rule: operator knobs read by a service's own config loader.
  const documented = new Set(readers.keys())
  const composeNames = parseComposeEnvNames(composeSource)
  const knobGaps: PassthroughGap[] = []
  for (const service of compose.keys()) {
    const configFile = join(REPO_ROOT, `apps/${service}/src/config.ts`)
    if (!existsSync(configFile)) continue
    const vars = parseConfigLoaderVars(readFileSync(configFile, 'utf8'))
    knobGaps.push(...findKnobGaps(service, vars, documented, composeNames))
  }
  gaps.push(...knobGaps)

  // Third rule: variables pinned to exactly these services.
  gaps.push(
    ...findRequiredPassthroughGaps(
      REQUIRED_PASSTHROUGH,
      compose,
      composeNames,
      parseComposeEnvFiles(composeSource),
    ),
  )
  for (const file of readdirSync(REPO_ROOT).filter((f) => /^docker-compose\..+\.ya?ml$/.test(f))) {
    gaps.push(...findOverlayExclusiveGaps(file, readFileSync(join(REPO_ROOT, file), 'utf8')))
  }

  const { stdout, stderr } = formatReport({
    generated,
    readers,
    gaps,
    required: REQUIRED_PASSTHROUGH,
    knobGaps: knobGaps.length,
  })
  for (const line of stdout) console.log(line)
  for (const line of stderr) console.error(line)
  if (stderr.length > 0 && !soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
