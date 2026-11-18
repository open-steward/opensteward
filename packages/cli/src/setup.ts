/**
 * `os setup` — the only interactive command in the CLI.
 *
 * Everything else in `os` is a non-interactive, generated wrapper around an
 * OpenAPI operation. This is a hand-written guided flow that mirrors the
 * admin web UI's setup wizard for operators who'd rather stay in a terminal:
 *
 *   1. Base URL        — confirm/select the admin-api endpoint, probe it
 *   2. Authenticate    — first-run bootstrap (POST /api/auth/setup), else login
 *   3. Branding        — optional company name + ISO-validated country
 *   4. Platforms       — enable adapters for a vertical
 *   5. API key         — optionally mint the first dev key (shown once)
 *
 * It drives the same admin-api routes the generated commands use (via
 * `makeClient`) and persists the JWT with `writeCredentials` so subsequent
 * plain `os` commands work without re-auth. The flow is re-runnable: auth
 * falls back from setup→login, and platform enable is an upsert.
 *
 * The flow (`runSetup`) takes its I/O and HTTP as injected deps so it can be
 * unit-tested without a TTY or a live server (see tests/setup.test.ts).
 */

import { Command } from 'commander'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { reference } from '@opensteward/shared'
import { resolveAuth, writeCredentials, type Credentials } from './auth.js'
import { makeClient } from './client.js'

// ── Pure helpers (exported for tests) ───────────────────────────────

/**
 * Normalise + validate a country input against the canonical ISO 3166-1
 * alpha-2 set. Returns the upper-cased code, or null if blank/unknown.
 */
export function validateCountry(inputStr: string): string | null {
  const code = inputStr.trim().toUpperCase()
  if (!code) return null
  return Object.prototype.hasOwnProperty.call(reference.COUNTRY_NAMES, code) ? code : null
}

/**
 * Resolve a comma/space-separated list of adapter slugs against the known
 * set (case-insensitive). Verticals can carry ~200 adapters, so the wizard
 * takes typed slugs rather than numbering an unscrollable menu. Returns the
 * canonical slugs to act on (deduped, order preserved) and any unknowns.
 */
export function resolveSlugs(
  inputStr: string,
  known: string[],
): { toEnable: string[]; unknown: string[] } {
  const byLower = new Map(known.map((s) => [s.toLowerCase(), s]))
  const toEnable: string[] = []
  const unknown: string[] = []
  for (const part of inputStr
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const canon = byLower.get(part.toLowerCase())
    if (canon) {
      if (!toEnable.includes(canon)) toEnable.push(canon)
    } else if (!unknown.includes(part)) {
      unknown.push(part)
    }
  }
  return { toEnable, unknown }
}

/** True if a POST /api/auth/setup status means a user already exists, so the
 *  wizard should fall back to login. */
export function setupTaken(status: number): boolean {
  return status === 409
}

/** Affirmative answer parse: y/yes (case-insensitive). Blank → default. */
export function isYes(inputStr: string, dflt = false): boolean {
  const t = inputStr.trim().toLowerCase()
  if (!t) return dflt
  return t === 'y' || t === 'yes'
}

// ── Injected I/O + HTTP ─────────────────────────────────────────────

export interface WizardIO {
  /** Visible prompt; returns the trimmed line. */
  ask(question: string): Promise<string>
  /** Hidden prompt (passwords); returns the raw line. */
  askHidden(question: string): Promise<string>
  /** Write a line to the user. */
  print(line: string): void
}

export interface WizardHttp {
  /** Minimal requester: status + parsed body. */
  request(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    init?: {
      params?: { path?: Record<string, unknown>; query?: Record<string, unknown> }
      body?: unknown
    },
  ): Promise<{ status: number; data?: unknown; error?: unknown }>
}

export interface WizardDeps {
  io: WizardIO
  /** Build an HTTP requester bound to a base URL + (optional) token. */
  http: (baseUrl: string, token: string | null) => WizardHttp
  /** Persist resolved credentials; returns the path written. */
  saveCredentials: (creds: Credentials) => string
  /** Default base URL to offer at the first prompt. */
  defaultBaseUrl: string
}

function unwrapData(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as Record<string, unknown>).data
  }
  return body
}

function errMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const e = (body as Record<string, unknown>).error
    if (typeof e === 'string') return e
    if (e && typeof e === 'object' && 'message' in (e as Record<string, unknown>)) {
      return String((e as Record<string, unknown>).message)
    }
    return JSON.stringify(body)
  }
  return String(body ?? 'unknown error')
}

// ── The flow ────────────────────────────────────────────────────────

export async function runSetup(deps: WizardDeps): Promise<void> {
  const { io } = deps
  io.print('OpenSteward setup — guided first-run configuration.')
  io.print('Press Enter to accept a [default]; leave a step blank to skip it.\n')

  // 1 ─ Base URL ----------------------------------------------------------
  let baseUrl = deps.defaultBaseUrl
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await io.ask(`Admin-api base URL [${baseUrl}]: `)
    if (answer.trim()) baseUrl = answer.trim()
    const probe = await deps.http(baseUrl, null).request('GET', '/version')
    if (probe.status >= 200 && probe.status < 500) {
      io.print(`✓ reachable: ${baseUrl}`)
      break
    }
    io.print(`✗ could not reach ${baseUrl} (status ${probe.status || 'no response'}).`)
    if (attempt === 2) {
      io.print('Giving up on connectivity — continuing anyway; later steps may fail.')
    }
  }

  // 2 ─ Authenticate ------------------------------------------------------
  const username = (await io.ask('Admin username: ')).trim()
  const password = await io.askHidden('Admin password: ')
  if (!username || !password) {
    io.print('✗ username and password are required — aborting setup.')
    return
  }
  let http = deps.http(baseUrl, null)
  let token: string | null = null

  const setupRes = await http.request('POST', '/api/auth/setup', {
    body: { username, password },
  })
  if (setupRes.status === 201) {
    token = (setupRes.data as { token?: string } | undefined)?.token ?? null
    io.print('✓ bootstrapped first admin account.')
  } else if (setupTaken(setupRes.status)) {
    const loginRes = await http.request('POST', '/api/auth/login', {
      body: { username, password },
    })
    if (loginRes.status === 200) {
      token = (loginRes.data as { token?: string } | undefined)?.token ?? null
      io.print('✓ logged in.')
    } else {
      io.print(
        `✗ login failed (status ${loginRes.status}): ${errMessage(loginRes.error ?? loginRes.data)}`,
      )
      return
    }
  } else {
    io.print(
      `✗ setup failed (status ${setupRes.status}): ${errMessage(setupRes.error ?? setupRes.data)}`,
    )
    return
  }
  if (!token) {
    io.print('✗ authentication returned no token — aborting.')
    return
  }
  const credPath = deps.saveCredentials({ baseUrl, jwt: token, username })
  io.print(`✓ credentials saved to ${credPath}`)
  http = deps.http(baseUrl, token)

  // 3 ─ Branding (optional) ----------------------------------------------
  if (isYes(await io.ask('\nConfigure company branding now? (y/N): '))) {
    const name = (await io.ask('Company name (blank to skip): ')).trim()
    let country: string | null = null
    for (;;) {
      const raw = await io.ask('Country (ISO alpha-2, e.g. SE; blank to skip): ')
      if (!raw.trim()) break
      country = validateCountry(raw)
      if (country) break
      io.print(
        `  '${raw.trim()}' is not a valid ISO 3166-1 alpha-2 code — try again (e.g. US, GB, SE).`,
      )
    }
    const body: Record<string, unknown> = {}
    if (name) body.name = name
    if (country) body.country = country
    if (Object.keys(body).length) {
      const res = await http.request('PUT', '/api/company-info', { body })
      if (res.status >= 200 && res.status < 300) io.print('✓ company branding saved.')
      else
        io.print(
          `✗ failed to save branding (status ${res.status}): ${errMessage(res.error ?? res.data)}`,
        )
    } else {
      io.print('  (nothing to save — skipped)')
    }
  }

  // 4 ─ Platforms ---------------------------------------------------------
  const vres = await http.request('GET', '/api/verticals')
  const verticals =
    (unwrapData(vres.data) as Array<{ name: string; status?: string; adapterCount?: number }>) ?? []
  if (verticals.length) {
    io.print('\nVerticals:')
    for (const v of verticals) {
      io.print(
        `  • ${v.name}${v.status ? ` (${v.status}` + (v.adapterCount != null ? `, ${v.adapterCount} adapters)` : ')') : ''}`,
      )
    }
    const chosen = (await io.ask('Configure platforms for which vertical? (name, blank to skip): '))
      .trim()
      .toLowerCase()
    const vertical = verticals.find((v) => v.name.toLowerCase() === chosen)?.name
    if (chosen && !vertical) io.print(`  unknown vertical '${chosen}' — skipping platforms.`)
    if (vertical) {
      const pres = await http.request('GET', '/api/verticals/{vertical}/platforms', {
        params: { path: { vertical } },
      })
      const platforms = (unwrapData(pres.data) as Array<{ slug: string; enabled?: boolean }>) ?? []
      if (!platforms.length) {
        io.print('  no adapters available for this vertical.')
      } else {
        const slugs = platforms.map((p) => p.slug)
        const enabledSet = new Set(platforms.filter((p) => p.enabled).map((p) => p.slug))
        // Verticals can carry ~200 adapters — preview a few + the count
        // and take typed slugs rather than dumping an unscrollable menu.
        const preview = slugs.slice(0, 12).join(', ')
        io.print(
          `\n${slugs.length} adapters in ${vertical} (e.g. ${preview}${slugs.length > 12 ? ', …' : ''}).`,
        )
        if (enabledSet.size) io.print(`  already enabled: ${[...enabledSet].join(', ')}`)
        const { toEnable, unknown } = resolveSlugs(
          await io.ask('Enter adapter slug(s) to enable (comma-separated, blank to skip): '),
          slugs,
        )
        for (const u of unknown) io.print(`  ? unknown adapter '${u}' — skipped`)
        let enabled = 0
        for (const slug of toEnable) {
          if (enabledSet.has(slug)) {
            io.print(`  • ${slug} already enabled`)
            continue
          }
          const res = await http.request(
            'POST',
            '/api/verticals/{vertical}/platforms/{slug}/enable',
            {
              params: { path: { vertical, slug } },
            },
          )
          if (res.status >= 200 && res.status < 300) {
            io.print(`  ✓ enabled ${slug}`)
            enabled++
          } else {
            io.print(
              `  ✗ failed to enable ${slug} (status ${res.status}): ${errMessage(res.error ?? res.data)}`,
            )
          }
        }
        if (enabled) {
          io.print(
            `  add credentials with:  os platforms config set ${vertical} <slug> --config-auth-type <type> ...`,
          )
        }
      }
    }
  }

  // 5 ─ API key (optional) ------------------------------------------------
  if (isYes(await io.ask('\nMint a first developer API key now? (y/N): '))) {
    const tenantId = (await io.ask('Tenant id for the key [default]: ')).trim() || 'default'
    const label = (await io.ask('Label (optional): ')).trim()
    const res = await http.request('POST', '/api/api-keys', {
      body: { tenantId, ...(label ? { label } : {}) },
    })
    if (res.status >= 200 && res.status < 300) {
      const key = unwrapData(res.data) as Record<string, unknown>
      const plaintext = (key?.key ?? key?.plaintext ?? key?.token) as string | undefined
      io.print('✓ API key minted — store it now; it is shown only once:')
      io.print(`  ${plaintext ?? JSON.stringify(key)}`)
    } else {
      io.print(`✗ failed to mint key (status ${res.status}): ${errMessage(res.error ?? res.data)}`)
    }
  }

  // 6 ─ Summary -----------------------------------------------------------
  io.print('\nSetup complete. Next steps:')
  io.print('  os verticals list                 # confirm vertical health')
  io.print('  os platforms config set <v> <slug> --config-auth-type <type> ...')
  io.print('  os webhook-subs create ...        # optional event delivery')
}

// ── Real-deps wiring + commander registration ───────────────────────

/** A hidden-input reader: mutes terminal echo while the user types. */
async function askHidden(rl: readline.Interface, question: string): Promise<string> {
  // Off a TTY (pipes/tests) there's no echo to mask and the
  // `_writeToOutput` hook isn't wired — read the line plainly.
  if (!input.isTTY) return rl.question(question)
  // The promises Interface wraps the same internal that `_writeToOutput`
  // guards; flip a mute flag around the question so the password isn't
  // echoed.
  const iface = rl as unknown as { stdoutMuted?: boolean; _writeToOutput?: (s: string) => void }
  const original = iface._writeToOutput?.bind(rl)
  iface.stdoutMuted = true
  iface._writeToOutput = (str: string) => {
    if (iface.stdoutMuted && original) {
      // Echo the prompt itself but mask typed characters.
      original(str.includes(question) ? str : '')
    } else if (original) {
      original(str)
    }
  }
  try {
    const answer = await rl.question(question)
    return answer
  } finally {
    iface.stdoutMuted = false
    if (original) iface._writeToOutput = original
    output.write('\n')
  }
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('Interactive first-run setup: authenticate, brand, enable platforms, mint a key')
    .action(async () => {
      // terminal mode (with echo) only on a real TTY; piped/non-TTY input
      // must read line-by-line or readline closes before the flow finishes.
      const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) })
      const io: WizardIO = {
        ask: async (q) => (await rl.question(q)).trim(),
        askHidden: (q) => askHidden(rl, q),
        print: (line) => output.write(line + '\n'),
      }
      const http: WizardDeps['http'] = (baseUrl, token) => {
        const client = makeClient('admin', { baseUrl, token, source: token ? 'flag' : 'none' })
        return {
          async request(method, path, init) {
            const r = await client.request(method, path, init)
            return { status: r.response?.status ?? 0, data: r.data, error: r.error }
          },
        }
      }
      try {
        await runSetup({
          io,
          http,
          saveCredentials: (creds) => writeCredentials(creds),
          defaultBaseUrl: resolveAuth().baseUrl,
        })
      } finally {
        rl.close()
      }
    })
}
