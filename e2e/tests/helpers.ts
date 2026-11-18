import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API_URL, ADMIN_URL } from '../playwright.config'

let stackProbe: Promise<boolean> | null = null

/**
 * Is a stack actually listening? Cached for the run. Specs skip (never fail)
 * when it is not — this suite reports on the product, not on whether docker
 * compose happens to be up.
 */
export function stackAvailable(): Promise<boolean> {
  stackProbe ??= (async () => {
    try {
      const [api, admin] = await Promise.all([
        fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3_000) }),
        fetch(`${ADMIN_URL}/health`, { signal: AbortSignal.timeout(3_000) }),
      ])
      return api.ok && admin.ok
    } catch {
      return false
    }
  })()
  return stackProbe
}

let envFile: Record<string, string> | null = null

/**
 * Fallback credential source: the repo root `.env`, where a compose
 * deployment already keeps its admin login (`ADMIN_USER` /
 * `ADMIN_USER_PASSWORD`; `ADMIN_PASS` is also accepted). Parsed the way
 * sourcing would read it — last assignment wins, optional surrounding
 * quotes stripped. Values never leave this process: they are typed into
 * the login form and nothing else.
 */
function envFileFallbacks(): Record<string, string> {
  if (envFile) return envFile
  envFile = {}
  try {
    const raw = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (!m) continue
      envFile[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch {
    /* no .env — explicit OS_E2E_* variables remain the only source */
  }
  return envFile
}

export const adminCredentials = (): { user: string; password: string } | null => {
  const file = envFileFallbacks()
  // Explicit OS_E2E_* always wins — pointing the suite at a staging stack
  // must not silently log in with the local deployment's credentials.
  const user = process.env.OS_E2E_ADMIN_USER ?? file['ADMIN_USER']
  const password =
    process.env.OS_E2E_ADMIN_PASSWORD ?? file['ADMIN_USER_PASSWORD'] ?? file['ADMIN_PASS']
  return user && password ? { user, password } : null
}
