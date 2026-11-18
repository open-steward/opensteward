import { readFileSync, statSync } from 'node:fs'

/** A license token is about 6 KB at most; anything this big is not one. */
export const MAX_LICENSE_FILE_BYTES = 64 * 1024

export interface LicenseConfig {
  /** OPENSTEWARD_LICENSE. Empty or whitespace counts as unset. */
  envToken?: string
  /** OPENSTEWARD_LICENSE_FILE, else license.key next to the credential store (P4). */
  filePath: string
}

export type LicenseSource =
  | { kind: 'env'; token: string; shadowedFile?: string }
  | { kind: 'file'; path: string; token: string }
  | { kind: 'none'; path: string }
  | { kind: 'error'; path: string; reason: 'FILE_UNREADABLE' | 'FILE_TOO_LARGE' | 'FILE_EMPTY' }

const ABSENT = new Set(['ENOENT', 'ENOTDIR'])

/**
 * Stands in for a path that is really a license token (OPENSTEWARD_LICENSE_FILE
 * set to the token, then resolved). Such a path is never read, logged or
 * returned: it reaches the status, the log line and /admin/license as this.
 */
export const TOKEN_AS_FILE_PATH = '(OPENSTEWARD_LICENSE_FILE holds a license token, not a path)'

/**
 * Doctor's rule (looksLikeLicenseToken), on every path segment: one that starts
 * `v4.public.`, or one longer than any file name may be (NAME_MAX, 255). A token
 * is one segment (base64url has no `/`), so `v4.public.<token>/license.key` is as
 * much a token as the bare token, and is never stat'ed, logged or returned. The
 * manager holds to it too: such a path is never watched or signed.
 */
export function isTokenAsPath(path: string): boolean {
  return path.split(/[\\/]/).some((seg) => seg.startsWith('v4.public.') || seg.length > 255)
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * First match wins (handover §5.1): the env token, then the file. Never throws.
 * Tokens are trimmed (a BOM, a \r\n file, an env value pasted with a newline).
 * statSync follows symlinks, so a Kubernetes Secret's ..data link resolves. A
 * missing file, or a missing directory, is `none`; anything else unreadable is
 * an error source, which evaluates to INVALID with the reason. A path that is
 * really a token is never read: it is FILE_UNREADABLE under TOKEN_AS_FILE_PATH.
 */
export function readLicenseSource(cfg: LicenseConfig): LicenseSource {
  const envToken = cfg.envToken?.trim()
  if (envToken) {
    return !isTokenAsPath(cfg.filePath) && isRegularFile(cfg.filePath)
      ? { kind: 'env', token: envToken, shadowedFile: cfg.filePath }
      : { kind: 'env', token: envToken }
  }
  if (isTokenAsPath(cfg.filePath)) {
    return { kind: 'error', path: TOKEN_AS_FILE_PATH, reason: 'FILE_UNREADABLE' }
  }
  const path = cfg.filePath
  try {
    const st = statSync(path)
    if (!st.isFile()) return { kind: 'error', path, reason: 'FILE_UNREADABLE' }
    if (st.size > MAX_LICENSE_FILE_BYTES) return { kind: 'error', path, reason: 'FILE_TOO_LARGE' }
    // An escape, never a literal U+FEFF: eslint's no-irregular-whitespace fails on one in a regex.
    const token = readFileSync(path, 'utf8')
      .replace(/^\uFEFF/, '')
      .trim()
    return token ? { kind: 'file', path, token } : { kind: 'error', path, reason: 'FILE_EMPTY' }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    return code !== undefined && ABSENT.has(code)
      ? { kind: 'none', path }
      : { kind: 'error', path, reason: 'FILE_UNREADABLE' }
  }
}
