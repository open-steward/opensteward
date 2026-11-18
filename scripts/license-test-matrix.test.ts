/**
 * Handover A §7 coverage manifest (Task A3.8). Every requirement has an ID. A
 * test that pins it carries the ID, bracketed with an L7 prefix, in its TITLE,
 * so a failure names the requirement. Fails when:
 *   - a requirement has no tagged test (deleted, or never written);
 *   - a tag names an ID §7 lacks (a typo);
 *   - a tag sits anywhere but a test title (a comment pins nothing);
 *   - a tagged test is skipped, todo or focused;
 *   - a tagged scripts/*.test.ts is missing from test:guard-scripts, so it never runs;
 *   - the Postgres requirement (C04) is not on its own runIf describe.
 * A tag is not proof a test can fail: each was mutation-checked when tagged.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const THIS_FILE = join(import.meta.dirname, 'license-test-matrix.test.ts')
export const SECTION_7: Readonly<Record<string, string>> = {
  V01: 'valid token',
  V02: 'tampered payload',
  V03: 'wrong signature',
  V04: 'unknown kid',
  V05: 'dev kid in a production build',
  V06: 'v2/v3 PASETO or a JWT',
  V07: 'wrong implicit assertion',
  V08: 'unknown claim (strict)',
  V09: 'unknown ver',
  V10: 'nbf in the future',
  V11: 'boundary exp-30d',
  V12: 'boundary exp',
  V13: 'boundary exp+30d',
  V14: 'revoked sub',
  V15: 'revocation list missing or invalid: warn and boot',
  V16: "env:'dev' startup warning",
  C01: 'rollback within tolerance',
  C02: 'rollback beyond tolerance',
  C03: 'max_seen_at persists on SQLite',
  C04: 'max_seen_at persists on Postgres',
  G01: '403 LICENSE_FEATURE_NOT_ENTITLED, structured',
  G02: '/v1/capabilities lists entitled verticals only, no licence details',
  G03: 'buildTools registers only listed verticals',
  G04: 'all tools plus a warning when the capabilities fetch fails',
  G05: 'GET /api/license rejects eut_',
  G06: 'GET /api/license rejects osk_',
  G07: 'GET /api/license rejects non-admin console users',
  G08: 'connection limit enforced at create',
  G09: 'typed error envelopes',
  G10: 'ungated endpoints reachable in DEGRADED (every state)',
  G11: 'hot reload of a renewed licence',
  G12: 'limits.tenants at POST /api/tenants, counting default',
  G13: 'over-cap connection: reads and sync pass, writes 403 incl. X-Admin-Secret',
  G14: 'MCP needs the runtime setting AND the licence',
  G15: '/v1/me/capabilities with an eut_ key',
  G16: '/api/license never leaks the token; unavailable → stale or 503',
  B01: 'exactly the five production kids',
  B02: 'no placeholders in a release',
  B03: 'no dev public key in production output',
  B04: 'no licence bypass in src/',
  N01: 'server starts in every state',
  N02: 'health green in every state',
  N03: 'existing data readable via export',
  N04: 'admin-api with integration-server down: typed answers, never 500',
  K01: 'token round-trips through buildSigningInput + sign + assembleToken + verifyLicense',
  K02: 'any changed byte fails',
}
const ROOTS = [
  'packages/license-token/tests',
  'packages/shared/tests',
  'apps/integration-server/tests',
  'apps/admin-api/tests',
  'apps/admin/tests',
  'apps/mcp-server/tests',
  'scripts',
]
const TAG = /\[L7:([A-Z]\d{2})\]/g
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/
const TITLE_LINE = /\bx?(?:describe|it|test)\b[\w$.<>]*\s*\(|\)\s*\(/
const NOT_RUN = /\.(?:skip|todo|only)\s*\(|\b(?:xit|xtest|xdescribe)\s*\(/

interface Tag {
  id: string
  file: string
  line: number
  text: string
}
function collect(): Tag[] {
  const tags: Tag[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'fixtures') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.test.ts') && full !== THIS_FILE) {
        const src = readFileSync(full, 'utf8')
        if (!src.includes('[L7:')) continue
        const file = relative(REPO_ROOT, full).split('\\').join('/')
        src.split('\n').forEach((text, i) => {
          for (const m of text.matchAll(TAG)) tags.push({ id: m[1]!, file, line: i + 1, text })
        })
      }
    }
  }
  for (const r of ROOTS) if (existsSync(join(REPO_ROOT, r))) walk(join(REPO_ROOT, r))
  return tags
}
const TAGS = collect()
const titled = TAGS.filter((t) => !COMMENT_LINE.test(t.text) && TITLE_LINE.test(t.text))
const where = (t: Tag) => `${t.file}:${t.line}`

test('every §7 requirement is pinned by a tagged test title', () => {
  const have = new Set(titled.map((t) => t.id))
  const missing = Object.keys(SECTION_7).filter((id) => !have.has(id))
  assert.deepEqual(
    missing,
    [],
    `untested §7 requirements:\n${missing.map((id) => `  ${id} ${SECTION_7[id]}`).join('\n')}`,
  )
})
test('every tag names a real §7 requirement', () => {
  assert.deepEqual(
    TAGS.filter((t) => !(t.id in SECTION_7)).map((t) => `${t.id} at ${where(t)}`),
    [],
  )
})
test('tags sit on the line that opens a test call (a comment or a wrapped title pins nothing)', () => {
  assert.deepEqual(TAGS.filter((t) => !titled.includes(t)).map(where), [])
})
test('no tagged test is skipped, todo or focused', () => {
  assert.deepEqual(titled.filter((t) => NOT_RUN.test(t.text)).map(where), [])
})
test('every tagged scripts/*.test.ts runs in test:guard-scripts', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const listed = new Set(pkg.scripts['test:guard-scripts']!.split(/\s+/))
  const files = [...new Set(titled.filter((t) => t.file.startsWith('scripts/')).map((t) => t.file))]
  assert.deepEqual(
    files.filter((f) => !listed.has(f)),
    [],
  )
})
test('C04 sits on its own Postgres-only describe, apart from C03 (review A3 #11)', () => {
  const c04 = titled.filter((t) => t.id === 'C04')
  assert.ok(c04.length > 0)
  for (const t of c04) {
    assert.match(t.text, /\.runIf\(/, `${where(t)} must be a describe.runIf(<TEST_DATABASE_URL>)`)
    assert.doesNotMatch(t.text, /\[L7:C03\]/, `${where(t)} also claims C03`)
  }
})
