/**
 * Regression pin for an authentication bypass on first-run admin creation.
 *
 * `POST /api/auth/setup` creates the initial admin account and only demands
 * `X-Bootstrap-Token` when a token is configured
 * (`core/routes/auth.ts`: `if (opts.bootstrapToken)`), fed by
 * `config.ts`: `bootstrapToken: process.env.BOOTSTRAP_TOKEN || undefined`.
 *
 * `scripts/generate-secrets.sh` mints a BOOTSTRAP_TOKEN and `.env.example`
 * documents it — but docker-compose.yml never forwarded it into the container.
 * So an operator who followed the repo's own tooling still ran with the gate
 * off: on a fresh deployment, with :3001 published, whoever posted a
 * username/password to /api/auth/setup before the operator finished setup
 * became the initial admin (and was auto-pinned as the break-glass account).
 *
 * Identical missing-passthrough shape to the ADMIN_SECRET gap pinned in
 * compose-admin-secret.test.ts — there it caused 403s, here it removed an
 * authentication check. `scripts/check-secret-passthrough.ts` now enforces the
 * general rule for every secret the generator mints; this pins the specific
 * one whose absence is exploitable.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const COMPOSE = join(REPO_ROOT, 'docker-compose.yml')

/** compose service name → the raw YAML block that defines it. */
function composeServiceBlocks(): Map<string, string> {
  const src = readFileSync(COMPOSE, 'utf8')
  const blocks = new Map<string, string>()
  const headings = [...src.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)]
  headings.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < headings.length ? (headings[i + 1]?.index ?? src.length) : src.length
    blocks.set(m[1] ?? '', src.slice(start, end))
  })
  return blocks
}

describe('docker-compose passes BOOTSTRAP_TOKEN to admin-api', () => {
  it('forwards the variable to the service that gates setup on it', () => {
    const block = composeServiceBlocks().get('admin-api')
    expect(block, 'admin-api is not a service in docker-compose.yml').toBeDefined()
    expect(
      /^\s+- BOOTSTRAP_TOKEN=/m.test(block ?? ''),
      'admin-api reads BOOTSTRAP_TOKEN to gate POST /api/auth/setup, but ' +
        'docker-compose.yml does not pass it — the first-run gate is off in the ' +
        'shipped stack no matter what the operator sets.',
    ).toBe(true)
  })

  it('admin-api still reads the variable, so this pin cannot pass vacuously', () => {
    // If the source stopped reading BOOTSTRAP_TOKEN, forwarding it would prove
    // nothing — the assertion above would be pinning a dead variable.
    const hit = execFileSync('git', ['grep', '-l', 'BOOTSTRAP_TOKEN', '--', 'apps/admin-api/src'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    expect(hit).toContain('apps/admin-api/src/config.ts')
  })
})
