/**
 * Every service that reads ADMIN_SECRET must receive it from docker-compose.
 *
 * admin-api is a CLIENT of integration-server's `/admin/*` routes. Its proxy
 * client attaches the credential conditionally
 * (`core/proxy/client.ts`: `config.adminSecret ? { 'X-Admin-Secret': … } : {}`,
 * fed by `core/server.ts` from `process.env['ADMIN_SECRET']`). If
 * docker-compose.yml does not pass the variable, that ternary silently sends
 * no header and every `/admin/*` passthrough 403s in production: api-keys,
 * connect-sessions, end-users, end-user-tokens, platforms, sync-jobs and
 * webhook-subscriptions — while every container stays healthy and every unit
 * test passes, because nothing else observes the missing variable.
 *
 * The invariant asserted here is deliberately derived from the source rather
 * than hardcoded to admin-api, so the next service that starts reading
 * ADMIN_SECRET is covered without anyone remembering this file exists.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const COMPOSE = join(REPO_ROOT, 'docker-compose.yml')

/** Services in docker-compose.yml that have a build context (i.e. our apps). */
function composeServiceEnv(): Map<string, string> {
  const src = readFileSync(COMPOSE, 'utf8')
  const blocks = new Map<string, string>()
  const headings = [...src.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)]
  headings.forEach((m, i) => {
    const start = m.index! + m[0].length
    const end = i + 1 < headings.length ? headings[i + 1].index! : src.length
    blocks.set(m[1], src.slice(start, end))
  })
  return blocks
}

/** App directories whose source reads ADMIN_SECRET from the environment. */
function appsReadingAdminSecret(): string[] {
  const appsDir = join(REPO_ROOT, 'apps')
  const out: string[] = []
  for (const app of readdirSync(appsDir)) {
    const srcDir = join(appsDir, app, 'src')
    if (!existsSync(srcDir)) continue
    try {
      execFileSync('git', ['grep', '-q', 'ADMIN_SECRET', '--', `apps/${app}/src`], {
        cwd: REPO_ROOT,
      })
      out.push(app)
    } catch {
      /* no match — git grep exits non-zero */
    }
  }
  return out
}

describe('docker-compose passes ADMIN_SECRET to every service that reads it', () => {
  it('no service reads ADMIN_SECRET without being given it', () => {
    const env = composeServiceEnv()
    const missing: string[] = []
    for (const app of appsReadingAdminSecret()) {
      const block = env.get(app)
      if (!block) continue // not a compose service (e.g. mcp-server, npm-only)
      if (!/^\s+- ADMIN_SECRET=/m.test(block)) missing.push(app)
    }
    expect(
      missing,
      `These services read ADMIN_SECRET but docker-compose.yml does not pass it, so ` +
        `their X-Admin-Secret header is silently omitted and integration-server's ` +
        `adminGuard returns 403: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('the scan actually finds services, so it cannot pass by matching nothing', () => {
    // A guard that silently matches zero services would pass forever.
    const apps = appsReadingAdminSecret()
    expect(apps).toContain('admin-api')
    expect(apps.length).toBeGreaterThanOrEqual(2)
  })
})
