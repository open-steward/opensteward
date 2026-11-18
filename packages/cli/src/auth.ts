/**
 * `auth` — credentials-file I/O for the `os` CLI.
 *
 * Persists JWT + base-URL at `~/.config/opensteward/credentials.json`
 * (mode 0600). Env-var overrides take priority, so CI never needs an
 * `os login` step:
 *
 *   OS_TOKEN or OS_API_KEY  →  use the env value as the bearer token
 *   OS_BASE_URL             →  use the env value as the base URL
 *
 * Resolution order (highest priority first):
 *   1. Explicit `--base-url` / `--token` CLI flags (passed in).
 *   2. Env vars (`OS_TOKEN`/`OS_API_KEY`/`OS_BASE_URL`).
 *   3. Credentials file at `~/.config/opensteward/credentials.json`.
 *   4. Throw if a token is required and none is present.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export interface Credentials {
  baseUrl: string
  jwt?: string
  username?: string
  /** ISO timestamp; advisory, not enforced — the server is the source of truth. */
  expiresAt?: string
}

export interface ResolvedAuth {
  baseUrl: string
  token: string | null
  source: 'flag' | 'env' | 'file' | 'none'
}

export interface AuthOptions {
  /** Override the home dir (test injection). */
  home?: string
  /** Override env vars (test injection). */
  env?: NodeJS.ProcessEnv
  /** Explicit `--base-url <url>` from a CLI invocation. */
  baseUrlFlag?: string
  /** Explicit `--token <jwt>` from a CLI invocation. */
  tokenFlag?: string
  /**
   * Which spec the command targets. Decides the default base URL: admin-api
   * commands go to :3001, public (`/v1/*`) commands to integration-server
   * on :3010. The public path deliberately ignores the credentials file's
   * `baseUrl` — `os login` writes admin-api's address there, and inheriting
   * it would silently send every vertical command to the wrong server.
   */
  spec?: 'admin' | 'public'
}

export function credentialsPath(home: string = homedir()): string {
  return join(home, '.config', 'opensteward', 'credentials.json')
}

export function readCredentials(home: string = homedir()): Credentials | null {
  const p = credentialsPath(home)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Credentials
  } catch {
    return null
  }
}

export function writeCredentials(creds: Credentials, home: string = homedir()): string {
  const p = credentialsPath(home)
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 })
  writeFileSync(p, JSON.stringify(creds, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(p, 0o600)
  } catch {
    /* ignore — best-effort tightening */
  }
  return p
}

export function clearCredentials(home: string = homedir()): boolean {
  const p = credentialsPath(home)
  if (!existsSync(p)) return false
  // Overwrite with an empty object first, then truncate to zero. This
  // gives the same on-disk footprint as a delete + create while keeping
  // file ownership/permission semantics intact.
  writeFileSync(p, '{}\n', { encoding: 'utf8', mode: 0o600 })
  return true
}

/** Resolve the active auth context, applying the env-var > file priority. */
export function resolveAuth(opts: AuthOptions = {}): ResolvedAuth {
  const env = opts.env ?? process.env
  const home = opts.home ?? homedir()

  // Token resolution.
  const envToken = env.OS_TOKEN || env.OS_API_KEY || ''
  const flagToken = (opts.tokenFlag ?? '').trim()
  const file = readCredentials(home)
  let token: string | null = null
  let tokenSource: ResolvedAuth['source'] = 'none'
  if (flagToken) {
    token = flagToken
    tokenSource = 'flag'
  } else if (envToken) {
    token = envToken
    tokenSource = 'env'
  } else if (file?.jwt) {
    token = file.jwt
    tokenSource = 'file'
  }

  // Base-URL resolution, per spec (see AuthOptions.spec).
  const flagBaseUrl = (opts.baseUrlFlag ?? '').trim()
  let baseUrl: string
  if (opts.spec === 'public') {
    const envPublic = (env.OS_PUBLIC_BASE_URL ?? '').trim()
    if (flagBaseUrl) baseUrl = flagBaseUrl
    else if (envPublic) baseUrl = envPublic
    else baseUrl = 'http://localhost:3010' // integration-server default
  } else {
    const envBaseUrl = (env.OS_BASE_URL ?? '').trim()
    if (flagBaseUrl) baseUrl = flagBaseUrl
    else if (envBaseUrl) baseUrl = envBaseUrl
    else if (file?.baseUrl) baseUrl = file.baseUrl
    else baseUrl = 'http://localhost:3001' // admin-api default; can be overridden per-call
  }

  return { baseUrl, token, source: tokenSource }
}

/** Stat the credentials file's mode for tests / diagnostics. */
export function credentialsFileMode(home: string = homedir()): number | null {
  const p = credentialsPath(home)
  if (!existsSync(p)) return null
  return statSync(p).mode & 0o777
}
