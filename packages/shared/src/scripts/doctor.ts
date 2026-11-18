#!/usr/bin/env node
/**
 * `pnpm doctor` — read-only preflight for OpenSteward operators.
 *
 * Verifies the deployment will boot cleanly. Catches common upgrade-time
 * footguns: env vars dropped from `.env`, config keys that drifted from
 * the example, encrypted blobs that won't decrypt
 * under the current `STORE_SECRET`, a docker volume that ran out of disk.
 * Also reports the license integration-server will run under.
 *
 * Exit code 0 if every check is PASS or WARN; 1 if any check is FAIL.
 * Licensing never FAILs: without a valid license the deployment still boots,
 * in community mode.
 *
 * No mutations. Doctor opens dbs read-only, reads files, runs `docker
 * volume inspect` and `df`, parses git status — nothing else.
 */
import { execSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import Database from 'better-sqlite3'
import { load as yamlLoad } from 'js-yaml'
import type { KeyMap } from '@opensteward/license-token'
import { assertSecret } from '../auth/secrets'
import { decrypt } from '../auth/crypto'
import {
  ADMIN_API_BLOBS,
  INTEGRATION_SERVER_BLOBS,
  type EncryptedBlob,
} from '../sqlite/encrypted-blobs'
import { LICENSE_RENEWAL_URL, formatLicenseLogLine, inspectLicense } from '../licensing'

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO'

export interface CheckResult {
  name: string
  status: CheckStatus
  detail: string
}

export interface DoctorOptions {
  /** Absolute path to the repo root. */
  repoRoot: string
  /** Env to evaluate. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /**
   * Override `docker volume inspect` + `df` invocations for tests.
   * When set, doctor never shells out for volume checks.
   */
  execShim?: (cmd: string) => string
  /** Override `git diff --quiet docker-compose.yml` exit code lookup. */
  gitDiffShim?: () => boolean | null
  /**
   * Paths to db files to inspect. Defaults to the standard layout under
   * `apps/<svc>/data/`. Tests pass explicit paths.
   */
  dbPaths?: {
    integrationServer?: string
    adminApi?: string
    webhookGateway?: string
  }
  /** Optional override of where to find docker-compose.yml. */
  composeFile?: string
  /**
   * STORE_SECRET to use for the encrypted-blob smoke decrypt. Defaults
   * to `env.STORE_SECRET`. Lets tests inject a known good/bad value
   * without poisoning the parent process env.
   */
  storeSecret?: string
  /**
   * License check test seam: the keys to verify with and which of their kids are
   * production keys. Default: the build's own key ring and production kids
   * (inside `inspectLicense`).
   */
  licenseKeyring?: { keyMap: KeyMap; productionKids: readonly string[] }
  /** Clock for the license check (epoch ms). Defaults to `Date.now`. */
  now?: () => number
  /**
   * The host OS, for the license check's bind-mount permissions row (Linux only:
   * Docker Desktop on macOS and Windows maps access to the host user). Defaults
   * to `process.platform`.
   */
  platform?: NodeJS.Platform
}

export interface DoctorReport {
  results: CheckResult[]
  /** PASS=0 / WARN=0 / FAIL=0 if every check returned PASS or WARN; 1 if any FAIL. */
  exitCode: 0 | 1
}

// ── Individual checks ───────────────────────────────────────────────────

const REQUIRED_SECRETS: ReadonlyArray<{ name: string; minLength?: number }> = [
  { name: 'STORE_SECRET' },
  { name: 'JWT_SECRET' },
  { name: 'SESSION_SECRET' },
]

const OPTIONAL_SECRETS: ReadonlyArray<{ name: string; minLength?: number }> = [
  { name: 'ADMIN_SECRET' },
]

export function checkEnvSecrets(env: NodeJS.ProcessEnv): CheckResult[] {
  const out: CheckResult[] = []
  for (const { name, minLength } of REQUIRED_SECRETS) {
    const value = env[name]
    try {
      assertSecret(name, value, {
        minLength,
        envAware: true,
        // Force production-style strictness — doctor reports the real
        // verdict regardless of how the operator's shell is configured.
        nodeEnv: 'production',
      })
      out.push({ name: `env: ${name}`, status: 'PASS', detail: 'present and strong' })
    } catch (err) {
      out.push({
        name: `env: ${name}`,
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }
  for (const { name, minLength } of OPTIONAL_SECRETS) {
    const value = env[name]
    if (!value) {
      out.push({
        name: `env: ${name}`,
        status: 'WARN',
        detail: 'optional — unset (control-plane admin endpoints will be unauthenticated in dev)',
      })
      continue
    }
    try {
      assertSecret(name, value, {
        minLength,
        envAware: true,
        nodeEnv: 'production',
      })
      out.push({ name: `env: ${name}`, status: 'PASS', detail: 'present and strong' })
    } catch (err) {
      out.push({
        name: `env: ${name}`,
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return out
}

/**
 * Parse a dotenv-style file into a plain object. Comments + blank lines
 * skipped; values are NOT shell-expanded.
 */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    // Strip surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

/** Pull the variable names declared in `.env.example`. */
export function extractDeclaredEnvNames(envExampleContent: string): {
  required: string[]
  optional: string[]
  all: string[]
} {
  const lines = envExampleContent.split('\n')
  const required = new Set<string>()
  const optional = new Set<string>()
  // Track which section we're in.
  let section: 'required' | 'optional' | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (/^#\s*──+\s*Required/i.test(line)) {
      section = 'required'
      continue
    }
    if (/^#\s*──+\s*Optional/i.test(line)) {
      section = 'optional'
      continue
    }
    // Per-entry header form: `# NAME — REQUIRED` / `# NAME — optional`
    const headerMatch = /^#\s+([A-Z_][A-Z0-9_]*)\s+—\s+(REQUIRED|optional)/.exec(line)
    if (headerMatch) {
      const [, name, flag] = headerMatch
      if (flag === 'REQUIRED') required.add(name)
      else optional.add(name)
      continue
    }
    // Fallback: `NAME=` assignment (assume "optional" if no header preceded).
    const assignMatch = /^([A-Z_][A-Z0-9_]*)=/.exec(line)
    if (assignMatch) {
      const [, name] = assignMatch
      if (!required.has(name) && !optional.has(name)) {
        if (section === 'required') required.add(name)
        else optional.add(name)
      }
    }
  }
  return {
    required: [...required].sort(),
    optional: [...optional].sort(),
    all: [...required, ...optional].sort(),
  }
}

export function checkEnvDrift(opts: DoctorOptions): CheckResult[] {
  const envExamplePath = join(opts.repoRoot, '.env.example')
  if (!existsSync(envExamplePath)) {
    return [
      {
        name: 'env: .env.example',
        status: 'WARN',
        detail: '.env.example missing — run `tsx scripts/generate-env-example.ts`',
      },
    ]
  }
  const envPath = join(opts.repoRoot, '.env')
  if (!existsSync(envPath)) {
    return [
      {
        name: 'env: .env',
        status: 'INFO',
        detail: 'no .env file at repo root — relying on shell/compose env',
      },
    ]
  }

  const declared = extractDeclaredEnvNames(readFileSync(envExamplePath, 'utf8'))
  const operator = parseDotEnv(readFileSync(envPath, 'utf8'))

  const missingRequired = declared.required.filter((n) => !(n in operator) || !operator[n])
  const missingOptional = declared.optional.filter((n) => !(n in operator))
  const unknown = Object.keys(operator).filter((n) => !declared.all.includes(n))

  const out: CheckResult[] = []
  if (missingRequired.length > 0) {
    out.push({
      name: 'env: required vars in .env',
      status: 'FAIL',
      detail: `missing: ${missingRequired.join(', ')}`,
    })
  } else {
    out.push({
      name: 'env: required vars in .env',
      status: 'PASS',
      detail: `all ${declared.required.length} required vars present`,
    })
  }
  if (missingOptional.length > 0) {
    out.push({
      name: 'env: optional vars in .env',
      status: 'WARN',
      detail: `missing optional: ${missingOptional.slice(0, 8).join(', ')}${missingOptional.length > 8 ? ` (+${missingOptional.length - 8})` : ''}`,
    })
  } else {
    out.push({
      name: 'env: optional vars in .env',
      status: 'PASS',
      detail: `all ${declared.optional.length} optional vars present`,
    })
  }
  if (unknown.length > 0) {
    out.push({
      name: 'env: unknown vars in .env',
      status: 'WARN',
      detail: `not in .env.example: ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? ` (+${unknown.length - 8})` : ''}`,
    })
  }
  return out
}

/** Recursively gather every dotted key path from a parsed YAML object. */
export function flattenYamlKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return prefix ? [prefix] : []
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = flattenYamlKeys(v, path)
      // Include intermediate path so empty sub-objects still show up.
      out.push(...(nested.length > 0 ? nested : [path]))
    } else {
      out.push(path)
    }
  }
  return out
}

export function checkConfigDrift(opts: DoctorOptions): CheckResult[] {
  const out: CheckResult[] = []
  const appsDir = join(opts.repoRoot, 'apps')
  if (!existsSync(appsDir)) {
    return [{ name: 'config: apps/*/config', status: 'INFO', detail: 'no apps/ directory' }]
  }
  let services: string[]
  try {
    services = readdirSync(appsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return [{ name: 'config: apps/*/config', status: 'INFO', detail: 'cannot read apps/' }]
  }

  for (const svc of services) {
    const examplePath = join(appsDir, svc, 'config', 'config.example.yml')
    const operatorPath = join(appsDir, svc, 'config', 'config.yml')
    const exampleExists = existsSync(examplePath)
    const operatorExists = existsSync(operatorPath)
    if (!exampleExists && !operatorExists) continue
    if (!exampleExists) {
      out.push({
        name: `config: ${svc}`,
        status: 'WARN',
        detail: 'has config.yml but no config.example.yml — cannot diff',
      })
      continue
    }
    if (!operatorExists) {
      out.push({
        name: `config: ${svc}`,
        status: 'INFO',
        detail: 'no operator config.yml — defaults will apply',
      })
      continue
    }
    let exampleKeys: string[]
    let operatorKeys: string[]
    try {
      exampleKeys = flattenYamlKeys(yamlLoad(readFileSync(examplePath, 'utf8')))
      operatorKeys = flattenYamlKeys(yamlLoad(readFileSync(operatorPath, 'utf8')))
    } catch (err) {
      out.push({
        name: `config: ${svc}`,
        status: 'FAIL',
        detail: `failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    const exampleSet = new Set(exampleKeys)
    const operatorSet = new Set(operatorKeys)
    const inExampleNotOperator = [...exampleSet].filter((k) => !operatorSet.has(k))
    const inOperatorNotExample = [...operatorSet].filter((k) => !exampleSet.has(k))
    if (inExampleNotOperator.length === 0 && inOperatorNotExample.length === 0) {
      out.push({
        name: `config: ${svc}`,
        status: 'PASS',
        detail: `${operatorKeys.length} keys match example`,
      })
      continue
    }
    const parts: string[] = []
    if (inExampleNotOperator.length > 0) {
      parts.push(
        `missing from operator: ${inExampleNotOperator.slice(0, 4).join(', ')}${inExampleNotOperator.length > 4 ? ` (+${inExampleNotOperator.length - 4})` : ''}`,
      )
    }
    if (inOperatorNotExample.length > 0) {
      parts.push(
        `not in example: ${inOperatorNotExample.slice(0, 4).join(', ')}${inOperatorNotExample.length > 4 ? ` (+${inOperatorNotExample.length - 4})` : ''}`,
      )
    }
    out.push({ name: `config: ${svc}`, status: 'WARN', detail: parts.join('; ') })
  }
  return out
}

interface DbDescriptor {
  /** Display name. */
  name: string
  /** Absolute path on disk. */
  path: string
  /** Encrypted blob registry entries that apply to this db. */
  blobs: EncryptedBlob[]
}

function defaultDbPaths(opts: DoctorOptions): DbDescriptor[] {
  const r = opts.repoRoot
  return [
    {
      name: 'integration-server',
      path:
        opts.dbPaths?.integrationServer ?? join(r, 'apps/integration-server/data/credentials.db'),
      blobs: INTEGRATION_SERVER_BLOBS,
    },
    {
      name: 'admin-api',
      path: opts.dbPaths?.adminApi ?? join(r, 'apps/admin-api/data/admin.db'),
      blobs: ADMIN_API_BLOBS,
    },
    {
      name: 'webhook-gateway',
      path: opts.dbPaths?.webhookGateway ?? join(r, 'apps/webhook-gateway/data/webhook-gateway.db'),
      blobs: [],
    },
  ]
}

export function checkSchemaVersions(opts: DoctorOptions): CheckResult[] {
  const out: CheckResult[] = []
  const dbs = defaultDbPaths(opts)
  for (const d of dbs) {
    if (!existsSync(d.path)) {
      out.push({
        name: `schema: ${d.name}`,
        status: 'INFO',
        detail: `db not found at ${relative(opts.repoRoot, d.path)} (first boot will create it)`,
      })
      continue
    }
    let db: Database.Database | undefined
    try {
      db = new Database(d.path, { readonly: true, fileMustExist: true })
      const trackerExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_migrations'")
        .get() as { name?: string } | undefined
      if (!trackerExists?.name) {
        out.push({
          name: `schema: ${d.name}`,
          status: 'WARN',
          detail: 'no _schema_migrations table — store not yet migrated',
        })
        continue
      }
      const rows = db
        .prepare(
          'SELECT namespace, MAX(version) AS version FROM _schema_migrations GROUP BY namespace ORDER BY namespace',
        )
        .all() as Array<{ namespace: string; version: number }>
      if (rows.length === 0) {
        out.push({
          name: `schema: ${d.name}`,
          status: 'INFO',
          detail: 'tracker present but empty',
        })
      } else {
        const summary = rows.map((r) => `${r.namespace}=v${r.version}`).join(', ')
        out.push({ name: `schema: ${d.name}`, status: 'PASS', detail: summary })
      }
    } catch (err) {
      out.push({
        name: `schema: ${d.name}`,
        status: 'FAIL',
        detail: `failed to read schema: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      db?.close()
    }
  }
  return out
}

export function checkEncryptedBlobs(opts: DoctorOptions): CheckResult[] {
  const out: CheckResult[] = []
  const secret = opts.storeSecret ?? opts.env?.['STORE_SECRET'] ?? process.env['STORE_SECRET']
  if (!secret) {
    return [
      {
        name: 'crypto: STORE_SECRET',
        status: 'WARN',
        detail: 'STORE_SECRET unset — skipping encrypted-blob smoke decrypt',
      },
    ]
  }
  const dbs = defaultDbPaths(opts)
  for (const d of dbs) {
    if (d.blobs.length === 0) continue
    if (!existsSync(d.path)) continue // schema check already reported.
    let db: Database.Database | undefined
    try {
      db = new Database(d.path, { readonly: true, fileMustExist: true })
      for (const blob of d.blobs) {
        const tableExists = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
          .get(blob.table) as { name?: string } | undefined
        if (!tableExists?.name) {
          out.push({
            name: `crypto: ${d.name}.${blob.table}.${blob.column}`,
            status: 'INFO',
            detail: 'table does not exist (no rows yet)',
          })
          continue
        }
        const row = db
          .prepare(
            `SELECT rowid, ${blob.column} AS ct FROM ${blob.table} WHERE ${blob.column} IS NOT NULL LIMIT 1`,
          )
          .get() as { rowid: number; ct: string } | undefined
        if (!row) {
          out.push({
            name: `crypto: ${d.name}.${blob.table}.${blob.column}`,
            status: 'INFO',
            detail: 'no encrypted rows yet',
          })
          continue
        }
        try {
          decrypt(row.ct, secret, blob.salt)
          out.push({
            name: `crypto: ${d.name}.${blob.table}.${blob.column}`,
            status: 'PASS',
            detail: `decrypted rowid=${row.rowid}`,
          })
        } catch (err) {
          out.push({
            name: `crypto: ${d.name}.${blob.table}.${blob.column}`,
            status: 'FAIL',
            detail: `decrypt failed (rowid=${row.rowid}): ${err instanceof Error ? err.message : String(err)} — STORE_SECRET may be wrong or data corrupted`,
          })
        }
      }
    } catch (err) {
      out.push({
        name: `crypto: ${d.name}`,
        status: 'FAIL',
        detail: `failed to open db: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      db?.close()
    }
  }
  return out
}

/**
 * Parse the top-level `volumes:` block of docker-compose.yml. Returns the
 * named volumes (the keys). Anonymous mounts and bind mounts are ignored.
 *
 * THROWS on unparseable YAML rather than returning `[]`. The two outcomes are
 * "this compose file declares no named volumes" and "this compose file could
 * not be read at all", and they must stay distinguishable: the caller renders
 * the empty array as a benign INFO row, so swallowing the parse error here
 * would tell an operator their volumes were fine when doctor had never
 * looked at a single one. The caller turns the throw into a FAIL, the same way
 * `checkConfigDrift` already handles a YAML it cannot read.
 */
export function parseComposeVolumes(composeContent: string): string[] {
  const parsed: unknown = yamlLoad(composeContent)
  if (!parsed || typeof parsed !== 'object') return []
  const root = parsed as Record<string, unknown>
  const volumes = root['volumes']
  if (!volumes || typeof volumes !== 'object' || Array.isArray(volumes)) return []
  return Object.keys(volumes as Record<string, unknown>).sort()
}

/** Smallest reasonable headroom we tolerate before warning. */
const MIN_FREE_BYTES = 1 * 1024 * 1024 * 1024 // 1 GiB

/** Parse `df -k <path>` output (POSIX 1024-byte blocks). Returns free bytes. */
export function parseDfFreeBytes(dfOutput: string): number | null {
  const lines = dfOutput.split('\n').filter((l) => l.trim().length > 0)
  // Skip header. Sometimes df line-wraps for long mountpoints; take the last
  // non-empty line.
  const dataLine = lines[lines.length - 1]
  if (!dataLine) return null
  // Columns: Filesystem 1024-blocks Used Available Capacity Mounted-on
  const cols = dataLine.split(/\s+/)
  // Available is column 3 (0-indexed) in the standard layout.
  if (cols.length < 4) return null
  const avail = Number(cols[3])
  if (!Number.isFinite(avail)) return null
  return avail * 1024
}

export function checkVolumesAndFreeSpace(opts: DoctorOptions): CheckResult[] {
  const out: CheckResult[] = []
  const composePath = opts.composeFile ?? join(opts.repoRoot, 'docker-compose.yml')
  if (!existsSync(composePath)) {
    return [
      {
        name: 'volumes: docker-compose.yml',
        status: 'INFO',
        detail: 'docker-compose.yml not found — skipping volume checks',
      },
    ]
  }
  let volumes: string[]
  try {
    volumes = parseComposeVolumes(readFileSync(composePath, 'utf8'))
  } catch (err) {
    // Unreadable/unparseable compose file. Report it — the volume and
    // free-space checks below did NOT run, and an operator reading a clean
    // report would otherwise conclude that they had.
    return [
      {
        name: 'volumes: docker-compose.yml',
        status: 'FAIL',
        detail: `failed to read or parse ${relative(opts.repoRoot, composePath)}: ${
          err instanceof Error ? err.message : String(err)
        } — volume and free-space checks were skipped`,
      },
    ]
  }
  if (volumes.length === 0) {
    return [
      {
        name: 'volumes: declared',
        status: 'INFO',
        detail: 'no named volumes in docker-compose.yml',
      },
    ]
  }

  const exec =
    opts.execShim ??
    ((cmd: string): string =>
      // Pipe stderr to /dev/null equivalent — doctor formats its own error
      // text, so the raw subprocess noise (e.g. "Error response from daemon:
      // no such volume") would just clutter the report.
      execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))

  // Compose namespaces named volumes by project name (typically the repo
  // directory). Try the bare name first, then `<project>_<name>`.
  const projectName = inferComposeProjectName(opts.repoRoot)

  for (const vol of volumes) {
    const candidates = [vol, projectName ? `${projectName}_${vol}` : null].filter(
      (s): s is string => !!s,
    )
    let mountpoint: string | null = null
    let resolvedName: string | null = null
    let lastErr: string | null = null
    for (const cand of candidates) {
      try {
        const mp = exec(`docker volume inspect ${cand} --format '{{.Mountpoint}}'`).trim()
        if (mp.length > 0) {
          mountpoint = mp
          resolvedName = cand
          break
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err)
      }
    }
    if (!mountpoint) {
      out.push({
        name: `volume: ${vol}`,
        status: 'WARN',
        detail: `not found via docker volume inspect (tried ${candidates.join(', ')})${lastErr ? `; last error: ${truncate(lastErr, 80)}` : ''}`,
      })
      continue
    }
    let dfOutput: string
    try {
      dfOutput = exec(`df -k '${mountpoint}'`)
    } catch (err) {
      out.push({
        name: `volume: ${resolvedName}`,
        status: 'WARN',
        detail: `df failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    const freeBytes = parseDfFreeBytes(dfOutput)
    if (freeBytes === null) {
      out.push({
        name: `volume: ${resolvedName}`,
        status: 'WARN',
        detail: 'could not parse df output',
      })
      continue
    }
    const freeGiB = freeBytes / 1024 / 1024 / 1024
    if (freeBytes < MIN_FREE_BYTES) {
      out.push({
        name: `volume: ${resolvedName}`,
        status: 'WARN',
        detail: `only ${freeGiB.toFixed(2)} GiB free under ${mountpoint}`,
      })
    } else {
      out.push({
        name: `volume: ${resolvedName}`,
        status: 'PASS',
        detail: `${freeGiB.toFixed(2)} GiB free under ${mountpoint}`,
      })
    }
  }
  return out
}

function inferComposeProjectName(repoRoot: string): string | null {
  // Compose default: lower-cased basename, alphanumerics + underscore only.
  const base = repoRoot.split(/\\|\//).filter(Boolean).pop()
  if (!base) return null
  return base.toLowerCase().replace(/[^a-z0-9_]/g, '')
}

export function checkComposeOverride(opts: DoctorOptions): CheckResult[] {
  const composePath = opts.composeFile ?? join(opts.repoRoot, 'docker-compose.yml')
  const overridePath = join(opts.repoRoot, 'docker-compose.override.yml')
  if (!existsSync(composePath)) {
    return [
      {
        name: 'compose: override pattern',
        status: 'INFO',
        detail: 'no docker-compose.yml to compare',
      },
    ]
  }
  const overrideExists = existsSync(overridePath)
  let isDirty: boolean | null = null
  if (opts.gitDiffShim) {
    isDirty = opts.gitDiffShim()
  } else {
    try {
      execSync(`git diff --quiet -- ${composePath}`, {
        cwd: opts.repoRoot,
        stdio: 'ignore',
      })
      isDirty = false
    } catch (err) {
      // Exit code 1 means "differences"; anything else (e.g. not a git repo)
      // we report as unknown.
      const status =
        (err as { status?: number; code?: number } | undefined)?.status ??
        (err as { status?: number; code?: number } | undefined)?.code
      if (status === 1) isDirty = true
      else isDirty = null
    }
  }
  if (isDirty === null) {
    return [
      {
        name: 'compose: override pattern',
        status: 'INFO',
        detail: 'git diff status unavailable',
      },
    ]
  }
  if (isDirty && !overrideExists) {
    return [
      {
        name: 'compose: override pattern',
        status: 'WARN',
        detail:
          'docker-compose.yml has uncommitted edits and no docker-compose.override.yml — copy docker-compose.override.example.yml to docker-compose.override.yml and move your edits there to avoid `git pull` conflicts',
      },
    ]
  }
  if (isDirty && overrideExists) {
    return [
      {
        name: 'compose: override pattern',
        status: 'WARN',
        detail:
          'docker-compose.yml has uncommitted edits — keep customizations in docker-compose.override.yml',
      },
    ]
  }
  return [
    {
      name: 'compose: override pattern',
      status: 'PASS',
      detail: overrideExists
        ? 'docker-compose.yml clean; docker-compose.override.yml present'
        : 'docker-compose.yml clean; no override needed',
    },
  ]
}

// ── License ─────────────────────────────────────────────────────────────

/** Where docker-compose.yml mounts ./opensteward-license inside integration-server. */
const LICENSE_DIR_IN_CONTAINER = '/etc/opensteward/license/'

/**
 * The host folder docker-compose.yml mounts at LICENSE_DIR_IN_CONTAINER, relative to
 * the repository root. Not ./license: on macOS and Windows that is the LICENSE file.
 */
const HOST_LICENSE_DIR = 'opensteward-license'

/** The image's `node` user and group (Dockerfile `USER node`): integration-server reads the license as them. */
const CONTAINER_UID = 1000
const CONTAINER_GID = 1000

/**
 * Whether the container's `node` user gets every one of `bits` (4 read, 1 search) on
 * a host file it sees through a bind mount, by mode bits alone: the owner's bits when
 * uid 1000 owns it, else the group's when gid 1000 does, else everyone's. ACLs and
 * supplementary groups are not modelled.
 */
export function containerUserCan(
  st: { mode: number; uid: number; gid: number },
  bits: number,
): boolean {
  const shift = st.uid === CONTAINER_UID ? 6 : st.gid === CONTAINER_GID ? 3 : 0
  return ((st.mode >> shift) & bits) === bits
}

/**
 * What keeps uid 1000 from opening `file` through a bind mount of `dir`: search on the
 * folder, read on the file. (A folder it cannot list only stops the directory watch,
 * and the hourly re-read still picks a renewal up.) Empty when nothing does, and when
 * either cannot be inspected: doctor then says nothing.
 */
function containerReadProblems(dir: string, file: string): string[] {
  try {
    const problems: string[] = []
    if (!containerUserCan(statSync(dir), 1)) {
      problems.push('its folder is not searchable by that uid')
    }
    if (!containerUserCan(statSync(file), 4)) {
      problems.push('the file is not readable by that uid')
    }
    return problems
  } catch {
    return []
  }
}

/** A path as a shell argument: bare when it is plain, single-quoted otherwise. */
function shellArg(p: string): string {
  return /^[\w./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`
}

/** integration-server's working directory, from source and in the image: relative paths resolve here. */
const INTEGRATION_SERVER_DIR = 'apps/integration-server'

/** `OPENSTEWARD_LICENSE_FILE`'s default in docker-compose.yml (`${OPENSTEWARD_LICENSE_FILE:-<path>}`). */
export function composeLicenseFileDefault(composeContent: string): string | null {
  const m = /OPENSTEWARD_LICENSE_FILE=\$\{OPENSTEWARD_LICENSE_FILE:-([^}]+)\}/.exec(composeContent)
  return m ? m[1]!.trim() : null
}

/**
 * A license token pasted into OPENSTEWARD_LICENSE_FILE, alone or behind a path
 * (`./v4.public…`, `/etc/opensteward/license/v4.public…`). It is never a usable
 * path: a token starts `v4.public.`, and even without that prefix it is one
 * segment (base64url has no `/`) longer than a file name may be (NAME_MAX, 255).
 * So any path segment that looks like that is a token. integration-server applies
 * the same rule to every segment (isTokenAsPath in licensing/source.ts).
 */
function looksLikeLicenseToken(value: string): boolean {
  return value.split(/[\\/]/).some((seg) => seg.startsWith('v4.public.') || seg.length > 255)
}

/**
 * A compose short-syntax volume, `SOURCE:TARGET[:MODE]`, split on the colons
 * outside `${…}`: an interpolated source (`${LIC_DIR:-./custom}`) has its own.
 */
function splitShortVolume(spec: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i]!
    if (c === '$' && spec[i + 1] === '{') depth++
    else if (c === '}' && depth > 0) depth--
    if (c === ':' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += c
    }
  }
  parts.push(current)
  return parts
}

/**
 * What one compose file mounts at /etc/opensteward/license on integration-server:
 * `undefined` when it mounts nothing there, `{hostDir}` for a bind mount doctor can
 * read, `{unreadable}` for a named volume or an interpolated path it cannot.
 */
type LicenseMount = { hostDir: string } | { unreadable: string } | undefined

function licenseMountIn(composeFile: string, projectDir: string): LicenseMount {
  if (!existsSync(composeFile)) return undefined
  const doc = yamlLoad(readFileSync(composeFile, 'utf8')) as {
    services?: Record<string, { volumes?: unknown } | null>
  } | null
  const volumes = doc?.services?.['integration-server']?.volumes
  if (!Array.isArray(volumes)) return undefined
  const target = LICENSE_DIR_IN_CONTAINER.slice(0, -1)
  for (const v of volumes as unknown[]) {
    // Short syntax HOST:CONTAINER[:MODE], or long syntax {type, source, target}.
    const parts = typeof v === 'string' ? splitShortVolume(v) : []
    const long = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
    const mountTarget = typeof v === 'string' ? parts[1] : long.target
    const source = typeof v === 'string' ? parts[0] : long.source
    if (typeof mountTarget !== 'string' || mountTarget.replace(/\/+$/, '') !== target) continue
    // Compose reads a source that is not a path (., / or ~) as a named volume.
    const isPath = typeof source === 'string' && /^[./~]/.test(source)
    if (!isPath || long.type === 'volume' || source.includes('$')) {
      return { unreadable: String(source ?? '(no source)') }
    }
    const hostDir = source.startsWith('~') ? join(homedir(), source.slice(1)) : source
    return { hostDir: resolve(projectDir, hostDir) }
  }
  return undefined
}

/**
 * The license as integration-server will see it — offline and read-only. Uses the
 * host clock (integration-server's clock high-water mark lives in its database)
 * and never FAILs: a missing, expired or invalid license runs in community mode
 * and does not stop a boot. PASS only for a VALID license signed by a production
 * key. Never prints the token: every detail is built from the evaluated status,
 * which carries none, and a token pasted into OPENSTEWARD_LICENSE_FILE is
 * reported without echoing that value or the path built from it.
 *
 * Lookup order is integration-server's: OPENSTEWARD_LICENSE, then
 * OPENSTEWARD_LICENSE_FILE (environment, .env, or the default docker-compose.yml
 * passes), then license.key next to STORE_PATH. Relative paths resolve from
 * apps/integration-server, the server's working directory. Empty values are unset
 * (compose forwards `${VAR:-}` as ''). A container path under
 * /etc/opensteward/license/ is read from the host directory compose mounts there:
 * docker-compose.override.yml's bind mount, else docker-compose.yml's, else
 * ./opensteward-license/. A named volume, or any other path this host cannot see,
 * is reported, not guessed. Doctor reads as the user running it; integration-server
 * reads a mounted file as uid 1000, so on a Linux host a mounted file that uid
 * cannot read is a WARN (Docker Desktop on macOS and Windows maps access to the
 * host user, so there it is not checked).
 */
export function checkLicense(opts: DoctorOptions): CheckResult[] {
  try {
    return inspectLicenseForDoctor(opts)
  } catch (err) {
    const detail = `could not evaluate: ${err instanceof Error ? err.message : String(err)}`
    return [{ name: 'license: state', status: 'WARN', detail }]
  }
}

function inspectLicenseForDoctor(opts: DoctorOptions): CheckResult[] {
  const env = opts.env ?? process.env
  const nowMs = (opts.now ?? Date.now)()
  const dotEnvPath = join(opts.repoRoot, '.env')
  const dotEnv = existsSync(dotEnvPath) ? parseDotEnv(readFileSync(dotEnvPath, 'utf8')) : {}
  const pick = (k: string): string | undefined => env[k]?.trim() || dotEnv[k]?.trim() || undefined
  const rel = (p: string): string => {
    const r = relative(opts.repoRoot, p)
    return r && !r.startsWith('..') && !isAbsolute(r) ? r : p
  }
  const serverDir = join(opts.repoRoot, INTEGRATION_SERVER_DIR)
  const hostLicenseFile = join(opts.repoRoot, HOST_LICENSE_DIR, 'license.key')
  const notes: string[] = []
  // The host folder read as the container's mount, when filePath came from one.
  let mountedDir: string | undefined

  // Where integration-server will look for the file, seen from this host.
  const composePath = opts.composeFile ?? join(opts.repoRoot, 'docker-compose.yml')
  const composeDefault = existsSync(composePath)
    ? composeLicenseFileDefault(readFileSync(composePath, 'utf8'))
    : null
  const fromEnvOrDotEnv = pick('OPENSTEWARD_LICENSE_FILE')
  const configured = fromEnvOrDotEnv ?? composeDefault ?? undefined
  // A token pasted into the path variable: never echo it, nor the path built from it.
  const tokenAsPath = configured !== undefined && looksLikeLicenseToken(configured)
  const storePath = resolve(serverDir, pick('STORE_PATH') ?? './data/credentials.db')
  const storeDirFile = join(dirname(storePath), 'license.key')
  let filePath: string
  if (configured && tokenAsPath) {
    filePath = resolve(serverDir, configured)
    notes.push(
      'OPENSTEWARD_LICENSE_FILE holds a license token, not a path: put it in OPENSTEWARD_LICENSE instead',
    )
  } else if (configured) {
    const onHost = resolve(serverDir, configured)
    if (existsSync(onHost)) {
      filePath = onHost
    } else if (configured.startsWith(LICENSE_DIR_IN_CONTAINER)) {
      // Compose merges volumes by target, so the override's mount replaces the base one.
      const inContainer = configured.slice(LICENSE_DIR_IN_CONTAINER.length)
      const composeFiles: ReadonlyArray<[string, string]> = [
        ['docker-compose.override.yml', join(opts.repoRoot, 'docker-compose.override.yml')],
        [basename(composePath), composePath],
      ]
      let mount: LicenseMount
      let mountedBy = ''
      for (const [name, file] of composeFiles) {
        try {
          mount = licenseMountIn(file, opts.repoRoot)
        } catch (err) {
          // js-yaml's message carries a multi-line snippet; the first line names the problem.
          const why = (err instanceof Error ? err.message : String(err)).split('\n')[0]
          notes.push(`could not read ${name} (${why}), so its volumes were not checked`)
          mount = undefined
        }
        if (mount) {
          mountedBy = name
          break
        }
      }
      if (mount && 'unreadable' in mount) {
        filePath = onHost
        notes.push(
          `${configured} is a container path, and ${mountedBy} mounts ${mount.unreadable} there, which doctor cannot read from this host`,
        )
      } else {
        const hostDir = mount?.hostDir ?? join(opts.repoRoot, HOST_LICENSE_DIR)
        const shownDir = isAbsolute(rel(hostDir)) ? rel(hostDir) : `./${rel(hostDir)}`
        filePath = join(hostDir, inContainer)
        mountedDir = hostDir
        notes.push(
          mount
            ? `${configured} is a container path; read ${shownDir}/, which ${mountedBy} mounts there`
            : `${configured} is a container path, but no compose file doctor read mounts a folder there; read ${shownDir}/, the folder docker-compose.yml mounts as shipped`,
        )
      }
    } else {
      filePath = onHost
      notes.push(
        `OPENSTEWARD_LICENSE_FILE=${configured} does not exist on this host (a path inside the container?); doctor cannot read it`,
      )
    }
  } else {
    filePath = storeDirFile
  }

  const envToken = pick('OPENSTEWARD_LICENSE')
  const config = { envToken, filePath }
  const keyring = opts.licenseKeyring
  const status = keyring
    ? inspectLicense({
        config,
        now: nowMs,
        keyMap: keyring.keyMap,
        productionKids: keyring.productionKids,
      })
    : inspectLicense({ config, now: nowMs })

  const kid = status.kid
  // With a token in OPENSTEWARD_LICENSE_FILE, the path (and the log line naming it) is the token.
  const pathIsSecret = tokenAsPath && status.source !== 'env'
  const where =
    status.source === 'env'
      ? 'from OPENSTEWARD_LICENSE'
      : status.source === 'file'
        ? `from ${rel(filePath)}`
        : `looked for ${rel(filePath)}`
  const stateText = `${status.state}${status.reason ? ` (${status.reason})` : ''}`
  const head = pathIsSecret
    ? [stateText, ...notes, 'until then integration-server runs in community mode']
    : [
        stateText,
        // The log line already says what to do for every state but a VALID one.
        formatLicenseLogLine(status).message,
        `${where}${kid ? `, key ${kid}` : ''}`,
        ...notes,
      ]
  const results: CheckResult[] = []
  if (status.state === 'VALID' && status.productionKid) {
    results.push({ name: 'license: state', status: 'PASS', detail: head.join('; ') })
  } else {
    const advice =
      status.state === 'VALID'
        ? [
            `key ${kid ?? '(none)'} is not a production signing key, so a production image refuses this license; get one at ${LICENSE_RENEWAL_URL}`,
          ]
        : []
    results.push({
      name: 'license: state',
      status: 'WARN',
      detail: [...head, ...advice].join('; '),
    })
  }
  // An environment token shadows the file: a renewal written there would do nothing.
  if (status.source === 'env' && status.shadowedFile) {
    results.push({
      name: 'license: source',
      status: 'WARN',
      detail: `OPENSTEWARD_LICENSE is set, so integration-server ignores ${rel(status.shadowedFile)}: a license renewed into that file has no effect until OPENSTEWARD_LICENSE is removed`,
    })
  }
  // The bind mount is read-only and the image reads it as uid 1000, not as this user.
  // Linux only: Docker Desktop (macOS, Windows) maps bind-mount access to the host
  // user, so there the mode bits say nothing about what the container can read.
  const platform = opts.platform ?? process.platform
  if (mountedDir && status.source === 'file' && platform !== 'darwin' && platform !== 'win32') {
    const unreadable = containerReadProblems(mountedDir, filePath)
    if (unreadable.length > 0) {
      const dirArg = shellArg(rel(mountedDir) || '.')
      results.push({
        name: 'license: permissions',
        status: 'WARN',
        detail: `integration-server reads ${rel(filePath)} as uid 1000 through a read-only bind mount, and ${unreadable.join(' and ')}, so the server can report INVALID (FILE_UNREADABLE) whatever doctor, reading as you, says above: run chmod 755 ${dirArg} && chmod 644 ${shellArg(rel(filePath))}`,
      })
    }
  }
  if (filePath !== hostLicenseFile && existsSync(hostLicenseFile)) {
    results.push({
      name: 'license: file',
      status: 'INFO',
      detail: `./${HOST_LICENSE_DIR}/license.key exists, but nothing points integration-server at it: set OPENSTEWARD_LICENSE_FILE, or mount ./${HOST_LICENSE_DIR} at /etc/opensteward/license as docker-compose.yml does`,
    })
  }
  // docker-compose.yml points the server at its mount, but a source run reads the store directory.
  if (!fromEnvOrDotEnv && composeDefault && status.source === 'none' && existsSync(storeDirFile)) {
    results.push({
      name: 'license: source run',
      status: 'INFO',
      detail: `${rel(storeDirFile)} exists: a source run (pnpm run dev) reads it, but docker-compose.yml points integration-server at ${composeDefault}`,
    })
  }
  return results
}

// ── Driver ──────────────────────────────────────────────────────────────

export function runDoctor(opts: DoctorOptions): DoctorReport {
  const env = opts.env ?? process.env
  const results: CheckResult[] = []
  results.push(...checkEnvSecrets(env))
  results.push(...checkEnvDrift(opts))
  results.push(...checkConfigDrift(opts))
  results.push(...checkSchemaVersions(opts))
  results.push(...checkEncryptedBlobs({ ...opts, env }))
  results.push(...checkVolumesAndFreeSpace(opts))
  results.push(...checkComposeOverride(opts))
  results.push(...checkLicense({ ...opts, env }))
  const exitCode: 0 | 1 = results.some((r) => r.status === 'FAIL') ? 1 : 0
  return { results, exitCode }
}

// ── Reporting ────────────────────────────────────────────────────────────

const STATUS_GLYPH: Record<CheckStatus, string> = {
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  INFO: 'INFO',
}

export function renderReport(report: DoctorReport): string {
  const rows = report.results.map((r) => [r.name, STATUS_GLYPH[r.status], r.detail])
  const colWidths = [
    Math.max(5, ...rows.map((row) => row[0].length)),
    Math.max(6, ...rows.map((row) => row[1].length)),
    Math.max(6, ...rows.map((row) => row[2].length)),
  ]
  const lines: string[] = []
  const headerCells = ['Check', 'Status', 'Detail']
  lines.push(formatRow(headerCells, colWidths))
  lines.push(colWidths.map((w) => '-'.repeat(w)).join('-+-'))
  for (const row of rows) {
    lines.push(formatRow(row, colWidths))
  }
  const counts = {
    PASS: 0,
    WARN: 0,
    FAIL: 0,
    INFO: 0,
  }
  for (const r of report.results) counts[r.status]++
  lines.push('')
  lines.push(
    `Summary: ${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail, ${counts.INFO} info — exit ${report.exitCode}`,
  )
  return lines.join('\n') + '\n'
}

function formatRow(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i])).join(' | ')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

// ── CLI entry point ─────────────────────────────────────────────────────

function findRepoRoot(start: string): string {
  let cur = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur
    const next = dirname(cur)
    if (next === cur) break
    cur = next
  }
  return start
}

function main(): void {
  // Resolve from cwd so the tool works regardless of where it's invoked from.
  const repoRoot = findRepoRoot(resolve(process.cwd()))
  const report = runDoctor({ repoRoot })
  process.stdout.write(renderReport(report))
  process.exit(report.exitCode)
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('doctor.ts') ||
    process.argv[1].endsWith('doctor.js') ||
    process.argv[1].endsWith('/doctor'))
if (isMain) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
