/**
 * Guard: which license public keys the product trusts.
 *
 * Every install verifies its license offline against keys compiled into
 * packages/shared/src/licensing. A wrong set fails silently either way: a
 * missing or mistyped production key turns every customer INVALID, and a
 * surviving development key lets anyone holding the committed dev1 fixture
 * mint any entitlement. Verifier unit tests are handed their key map, so they
 * cannot see this; this check looks at the key maps and at compiled output.
 *
 * Modes:
 *   source (default)   exactly k2026a, k2026b, k2026c, r2026a, r2026b; each a
 *                      canonical base64url 32-byte key or PLACEHOLDER:<kid>;
 *                      no duplicate; no production key reused as a dev key;
 *                      development kids are dev1/devk1 only; dev1 equals
 *                      packages/license-token/fixtures/dev1.json; nothing in
 *                      packages/shared/src imports keys.dev except keyring.ts's
 *                      one guarded require('./keys.dev') (no other specifier,
 *                      no second one); no quoted development kid outside
 *                      keys.dev.ts; a committed revocation list verifies;
 *                      both key files keep the text shape the license
 *                      service reads (checkKeyFileShape).
 *   --artifact <dir>   compiled output, repeatable. The Dockerfile builder runs
 *                      it right after the production build profile deletes
 *                      keys.dev.*: no keys.dev.* file, no quoted development kid,
 *                      no development key bytes, and the compiled keyring trusts
 *                      exactly the five kids with and without development keys.
 *                      Never reads the dev fixture: .dockerignore keeps it out
 *                      of the build context. The development public keys come
 *                      from keys.dev.ts.
 *   --soft             report only.
 *   --release          also: no placeholder key; REVOCATION_LIST_TOKEN present,
 *                      verifying under a production kid with the revocations
 *                      assertion, not dated ahead, and not older than the list
 *                      in the previous platform/v* tag (a shallow clone or
 *                      any git error fails closed). Older than 90 days only
 *                      warns. Reads source text only, so it runs on an unbuilt
 *                      checkout.
 *
 * Run: `pnpm check:license-keys` (`pnpm check:license-keys:soft` reports only).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(import.meta.dirname, '..')
const SHARED_SRC = join(REPO_ROOT, 'packages', 'shared', 'src')
const DEV_FIXTURE = join(REPO_ROOT, 'packages', 'license-token', 'fixtures', 'dev1.json')

/** The production kids every install trusts (handover §5.2, D11). */
export const EXPECTED_PRODUCTION_KIDS = ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b'] as const
export const PLACEHOLDER_PREFIX = 'PLACEHOLDER:'
/** The development kids, as a pattern: no quoted development kid lives outside keys.dev.ts. */
export const DEV_KID_PATTERN = /^devk?1$/
/** A quoted development kid, in source or in compiled output. */
const DEV_KID_LITERAL = /['"`]devk?1['"`]/
/** An import, export, dynamic import or require of a module named keys.dev. */
const DEV_MODULE_REF =
  /\b(from|import|require)\s*\(?\s*(['"`])[^'"`]*\bkeys\.dev(?:\.[cm]?[jt]s)?\2/g

type KeyMap = Readonly<Record<string, string>>
export interface KeyProblem {
  rule: string
  detail: string
}
export interface ArtifactFile {
  path: string
  content: string
}
export interface CompiledKeyring {
  /** Kids of getKeyring({ includeDevKeys: false }). */
  production: string[]
  /** Kids of getKeyring(). */
  all: string[]
}
export type VerifyRevocations = (
  token: string,
  keys: KeyMap,
) => { ok: true; kid: string } | { ok: false; reason: string; detail?: string }

const sorted = (xs: Iterable<string>): string[] => [...xs].sort()
const sameSet = (a: Iterable<string>, b: Iterable<string>): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/** Canonical base64url only: Buffer's decoder skips junk and ignores padding and trailing bits. */
export function decodeRawKey(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const raw = Buffer.from(value, 'base64url')
  return raw.toString('base64url') === value ? raw : null
}

export function checkKeySets(
  prod: KeyMap,
  dev: KeyMap,
  opts: { release?: boolean } = {},
): KeyProblem[] {
  const problems: KeyProblem[] = []
  if (!sameSet(Object.keys(prod), EXPECTED_PRODUCTION_KIDS)) {
    problems.push({
      rule: 'kid-set',
      detail: `production kids are [${sorted(Object.keys(prod)).join(', ')}]; expected exactly [${EXPECTED_PRODUCTION_KIDS.join(', ')}]`,
    })
  }
  const byValue = new Map<string, string>()
  for (const [kid, value] of Object.entries(prod)) {
    if (value.startsWith(PLACEHOLDER_PREFIX)) {
      if (value !== `${PLACEHOLDER_PREFIX}${kid}`) {
        problems.push({
          rule: 'placeholder-mismatch',
          detail: `${kid} holds ${value}; a placeholder names its own kid`,
        })
      } else if (opts.release) {
        problems.push({
          rule: 'placeholder',
          detail: `${kid} is still a placeholder: replace it with the license service's KMS public key`,
        })
      }
      continue
    }
    const raw = decodeRawKey(value)
    if (!raw || raw.length !== 32) {
      problems.push({
        rule: 'key-shape',
        detail: `${kid} is not canonical base64url of a 32-byte Ed25519 public key`,
      })
      continue
    }
    if (raw.every((b) => b === 0)) {
      problems.push({ rule: 'zero-key', detail: `${kid} is the all-zero key` })
      continue
    }
    const prior = byValue.get(value)
    if (prior)
      problems.push({ rule: 'duplicate', detail: `${prior} and ${kid} share one public key` })
    byValue.set(value, kid)
  }
  for (const [kid, value] of Object.entries(dev)) {
    if (!DEV_KID_PATTERN.test(kid)) {
      problems.push({
        rule: 'dev-kid-set',
        detail: `unexpected development kid ${kid}; only dev1 and devk1 exist`,
      })
    }
    if (!value.startsWith(PLACEHOLDER_PREFIX) && decodeRawKey(value)?.length !== 32) {
      problems.push({
        rule: 'dev-key-shape',
        detail: `development kid ${kid} is not a 32-byte base64url key or PLACEHOLDER:${kid}`,
      })
    }
    const twin = byValue.get(value)
    if (twin) {
      problems.push({
        rule: 'prod-equals-dev',
        detail: `development kid ${kid} reuses production key ${twin}`,
      })
    }
  }
  return problems
}

export function checkDevFixture(
  dev: KeyMap,
  fixture: { kid: string; publicKey: string },
): KeyProblem[] {
  return dev[fixture.kid] === fixture.publicKey
    ? []
    : [
        {
          rule: 'dev-fixture',
          detail: `DEV_KEYS.${fixture.kid} differs from packages/license-token/fixtures/dev1.json: tests would sign with a key the keyring does not trust`,
        },
      ]
}

/**
 * The one keys.dev reference keyring.ts may hold, as DEV_MODULE_REF matches it
 * (up to the closing quote). Any other specifier fails: `./keys.dev.ts` resolves
 * under vitest, where Node 24 loads .ts, but never in dist, so dev keys would
 * silently vanish from the dev-profile image; a backtick or a different path
 * dodges the exact form this pins.
 */
const ALLOWED_DEV_REQUIRE = /^require\((['"])\.\/keys\.dev\1$/

/** Only keyring.ts may reach keys.dev, and only through one `require('./keys.dev')` (review #9). */
export function scanDevModuleImports(files: ArtifactFile[]): KeyProblem[] {
  const problems: KeyProblem[] = []
  for (const f of files) {
    if (/(^|\/)licensing\/keys\.dev\.[cm]?[jt]s$/.test(f.path)) continue
    const isKeyring = /(^|\/)licensing\/keyring\.ts$/.test(f.path)
    let allowedSeen = false
    for (const m of f.content.matchAll(DEV_MODULE_REF)) {
      if (isKeyring && !allowedSeen && ALLOWED_DEV_REQUIRE.test(m[0])) {
        allowedSeen = true
        continue
      }
      problems.push({
        rule: 'dev-module-import',
        detail: `${f.path}: \`${m[0]}\`. Only keyring.ts may load keys.dev, once, through exactly its guarded \`require('./keys.dev')\`: a static import crashes every production image (MODULE_NOT_FOUND), and a suffixed specifier such as ./keys.dev.ts resolves under vitest but never in dist`,
      })
    }
  }
  return problems
}

/** No quoted development kid in source outside keys.dev.ts: compiled output would carry it. */
export function scanSourceLiterals(files: ArtifactFile[]): KeyProblem[] {
  return files
    .filter((f) => /\.[cm]?[jt]s$/.test(f.path) && !/(^|\/)licensing\/keys\.dev\.ts$/.test(f.path))
    .filter((f) => DEV_KID_LITERAL.test(f.content))
    .map((f) => ({
      rule: 'dev-kid-literal',
      detail: `${f.path} names a development kid in quotes; use isDevKid()`,
    }))
}

/** The key-map files, by export, whose TEXT the license service reads. */
export const KEY_FILES = [
  ['keys.production.ts', 'PRODUCTION_KEYS'],
  ['keys.dev.ts', 'DEV_KEYS'],
] as const

/**
 * The license service reads keys.production.ts and keys.dev.ts as text (its
 * `keys:check` compares them with its KMS keys), not as modules. checkKeySets
 * imports them, so it would accept a refactor that breaks that reader: `as
 * const`, a spread, a computed key, a template literal, a generic call, an
 * escape, or a second binding. Comments are ignored, as the service ignores them.
 */
export function checkKeyFileShape(source: string, exportName: string, file: string): KeyProblem[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const fail = (why: string): KeyProblem[] => [
    {
      rule: 'key-file-shape',
      detail: `${file}: ${why}. The license service reads this file as text: keep \`export const ${exportName}: … = Object.freeze({\`, one \`kid: '<value>',\` line per key, then \`})\``,
    },
  ]
  const declarations = code.match(
    new RegExp(String.raw`\b(?:const|let|var)\s+${exportName}\b`, 'g'),
  )
  if (declarations?.length !== 1) {
    return fail(`${exportName} must be declared once (found ${declarations?.length ?? 0})`)
  }
  const block = new RegExp(
    String.raw`^export const ${exportName}(?::[^=\n]+)? = Object\.freeze\(\{\n(?:  [a-z0-9]{1,16}: '[^'\\\n]*',\n)+\}\)\n`,
    'm',
  )
  const match = block.exec(code)
  if (!match) return fail(`${exportName} is not in that shape`)
  const rest = code.slice(0, match.index) + code.slice(match.index + match[0].length)
  if (new RegExp(String.raw`\bas\s+${exportName}\b|\b${exportName}\s*=(?!=)`).test(rest)) {
    return fail(`${exportName} is bound or assigned a second time`)
  }
  return []
}

/** A committed list must verify under the production keys with the revocations assertion. */
export function checkRevocationList(
  token: string | null,
  prod: KeyMap,
  verify: VerifyRevocations,
): KeyProblem[] {
  if (token === null) return []
  const real = Object.fromEntries(
    Object.entries(prod).filter(([, v]) => !v.startsWith(PLACEHOLDER_PREFIX)),
  )
  const r = verify(token, real)
  return r.ok
    ? []
    : [
        {
          rule: 'revocations-invalid',
          detail: `REVOCATION_LIST_TOKEN does not verify under the production keys with the revocations assertion: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`,
        },
      ]
}

/** Every .js/.cjs/.mjs/.ts/.map/.json file under `dir`, one at a time (integration-server's dist is ~18k files). */
export function* iterateArtifact(dir: string): Generator<ArtifactFile> {
  const stack = [dir]
  while (stack.length > 0) {
    const d = stack.pop()!
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const full = join(d, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (/\.(?:[cm]?js|ts|map|json)$/.test(e.name)) {
        yield {
          path: relative(dir, full).split('\\').join('/'),
          content: readFileSync(full, 'utf8'),
        }
      }
    }
  }
}
export function readArtifact(dir: string): ArtifactFile[] {
  return [...iterateArtifact(dir)]
}

/** Every encoding a development public key could appear in: base64url, base64, hex. */
export function devKeyNeedles(dev: KeyMap): string[] {
  const out = new Set<string>()
  for (const value of Object.values(dev)) {
    const raw = value.startsWith(PLACEHOLDER_PREFIX) ? null : decodeRawKey(value)
    if (!raw) continue
    const b64 = raw.toString('base64')
    for (const n of [
      value,
      raw.toString('hex'),
      raw.toString('hex').toUpperCase(),
      b64,
      b64.replace(/=+$/, ''),
    ]) {
      out.add(n)
    }
  }
  return [...out]
}

export function scanArtifact(files: ArtifactFile[], dev: KeyMap): KeyProblem[] {
  const problems: KeyProblem[] = []
  const needles = devKeyNeedles(dev)
  for (const f of files) {
    if (/(^|\/)licensing\/keys\.dev\./.test(f.path)) {
      problems.push({
        rule: 'dev-module-present',
        detail: `${f.path}: the production build profile must delete it`,
      })
    }
    if (/\.(?:[cm]?js|ts)$/.test(f.path) && DEV_KID_LITERAL.test(f.content)) {
      problems.push({ rule: 'dev-kid-literal', detail: `${f.path} names a development kid` })
    }
    if (needles.some((n) => f.content.includes(n))) {
      problems.push({
        rule: 'dev-public-key',
        detail: `${f.path} contains a development public key`,
      })
    }
  }
  return problems
}

export function loadCompiledKeyring(keyringJs: string): CompiledKeyring {
  const mod = createRequire(import.meta.url)(keyringJs) as {
    getKeyring(o?: { includeDevKeys?: boolean }): KeyMap
  }
  return {
    production: Object.keys(mod.getKeyring({ includeDevKeys: false })),
    all: Object.keys(mod.getKeyring()),
  }
}

export function checkArtifactKeyring(k: CompiledKeyring): KeyProblem[] {
  const problems: KeyProblem[] = []
  for (const [view, kids] of [
    ['without development keys', k.production],
    ['as shipped', k.all],
  ] as const) {
    if (!sameSet(kids, EXPECTED_PRODUCTION_KIDS)) {
      problems.push({
        rule: 'artifact-keyring',
        detail: `the compiled keyring (${view}) trusts [${sorted(kids).join(', ')}]; production output trusts exactly [${EXPECTED_PRODUCTION_KIDS.join(', ')}]`,
      })
    }
  }
  return problems
}

// ─────────────────────────────────────────────────────────────────────────────
// --release (Task A3.3). Additive to A2c-2's source and --artifact modes;
// main() calls runReleaseChecks() only under --release. Nothing here imports a
// workspace package by name or reads build output, so images.yml's prepare
// job can run it on a bare `pnpm install`. Named apart from A2c-2's
// source-mode checkRevocationList/VerifyRevocations, which stay as they are.
// ─────────────────────────────────────────────────────────────────────────────

/** A list older than this only WARNS at release (P9): the service may have revoked nothing new. */
export const REVOCATION_WARN_AGE_DAYS = 90
export const REVOCATIONS_SOURCE = 'packages/shared/src/licensing/revocations.ts'
const RELEASE_DAY_MS = 86_400_000

export interface ReleaseReport {
  problems: KeyProblem[]
  warnings: string[]
  notes: string[]
}
export type ReleaseVerifyRevocations = (
  token: string,
  keys: KeyMap,
) =>
  | { ok: true; payload: { iat: string }; kid: string }
  | { ok: false; reason: string; detail?: string }
export type Git = (args: readonly string[]) => string
export type PreviousList =
  | { kind: 'none'; note: string }
  | { kind: 'found'; tag: string; iat: string }
  | { kind: 'error'; detail: string }

/** A placeholder verifies nothing (BAD_KEY), so licences signed by that kid could never be honoured. */
export function placeholderProblems(prod: KeyMap): KeyProblem[] {
  return Object.entries(prod)
    .filter(([, v]) => v.startsWith(PLACEHOLDER_PREFIX))
    .map(([kid]) => ({
      rule: 'placeholder',
      detail: `${kid} is still a placeholder — replace it with the license service's KMS public key (Task A3.9)`,
    }))
}

/**
 * The value assigned to REVOCATION_LIST_TOKEN, read from the file's TEXT:
 * `null`, one string literal, or `undefined` when the file assigns neither.
 * Reading text keeps the gate build-free, and lets the same parser read an
 * earlier release's file straight out of git.
 */
export function extractRevocationToken(source: string): string | null | undefined {
  const m =
    /export\s+const\s+REVOCATION_LIST_TOKEN\b[^=]*=\s*(?:(null)\b|'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)/.exec(
      source,
    )
  if (!m) return undefined
  if (m[1] === 'null') return null
  return (m[2] ?? m[3] ?? m[4] ?? '').trim()
}

/** `iat` of a revocation token WITHOUT verifying it: used only on a list an earlier, already-gated release shipped. */
export function decodeRevocationIat(token: string): string | null {
  const [version, purpose, body] = token.split('.')
  if (version !== 'v4' || purpose !== 'public' || !body) return null
  const raw = Buffer.from(body, 'base64url')
  if (raw.length <= 64) return null
  try {
    const { iat } = JSON.parse(raw.subarray(0, raw.length - 64).toString('utf8')) as {
      iat?: unknown
    }
    return typeof iat === 'string' && !Number.isNaN(Date.parse(iat)) ? iat : null
  } catch {
    return null
  }
}

/** Present, verifies under a PRODUCTION kid with the revocations assertion, not dated ahead. Age only warns. */
export function checkReleaseRevocationList(
  token: string | null | undefined,
  prod: KeyMap,
  now: Date,
  verify: ReleaseVerifyRevocations,
): ReleaseReport & { iat?: string } {
  const report = (problems: KeyProblem[], warnings: string[] = [], iat?: string) => ({
    problems,
    warnings,
    notes: [] as string[],
    ...(iat === undefined ? {} : { iat }),
  })
  if (token === undefined)
    return report([
      {
        rule: 'revocations-unreadable',
        detail: `${REVOCATIONS_SOURCE} must assign REVOCATION_LIST_TOKEN one string literal, or null`,
      },
    ])
  if (token === null)
    return report([
      {
        rule: 'revocations-missing',
        detail:
          'REVOCATION_LIST_TOKEN is null — every release ships the current list signed by the license service (an empty list is fine)',
      },
    ])
  const production = Object.fromEntries(
    Object.entries(prod).filter(([, v]) => !v.startsWith(PLACEHOLDER_PREFIX)),
  )
  const r = verify(token, production)
  if (!r.ok)
    return report([
      {
        rule: 'revocations-invalid',
        detail: `the revocation list does not verify under a production kid with the revocations assertion: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`,
      },
    ])
  const iat = r.payload.iat
  const age = now.getTime() - Date.parse(iat)
  if (age < -RELEASE_DAY_MS)
    return report(
      [
        {
          rule: 'revocations-future',
          detail: `the revocation list is dated ${iat}, more than a day ahead — every later release would have to ship a list at least that new`,
        },
      ],
      [],
      iat,
    )
  const days = Math.floor(age / RELEASE_DAY_MS)
  const warnings =
    days > REVOCATION_WARN_AGE_DAYS
      ? [
          `the revocation list is ${days} days old (signed ${iat}); ask the license service for a current one`,
        ]
      : []
  return report([], warnings, iat)
}

export const defaultGit: Git = (args) =>
  execFileSync('git', [...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

/**
 * The revocation list shipped by the newest EARLIER `platform/v*` release.
 * The tag on HEAD itself is skipped, because images.yml runs on the tag being
 * released. Without git history (missing git, a shallow clone, or a git that
 * cannot resolve HEAD, list tags, or read a tag's tree or its list) a release
 * fails closed rather than skip the comparison. Only a tag whose readable tree
 * has no revocations.ts reads as "predates licensing". A full clone fetched
 * without its tags (`--no-tags`) still reads as "no earlier release", so the
 * release gate's checkout must fetch tags (images.yml's prepare job:
 * actions/checkout with fetch-depth: 0).
 */
export function previousRevocationList(git: Git): PreviousList {
  const run = (args: readonly string[]): string | null => {
    try {
      return git(args)
    } catch {
      return null
    }
  }
  const shallow = run(['rev-parse', '--is-shallow-repository'])
  if (shallow === null)
    return { kind: 'error', detail: 'git is unavailable, so the previous release cannot be read' }
  if (shallow === 'true')
    return {
      kind: 'error',
      detail:
        'this is a shallow clone without release tags — fetch them (actions/checkout fetch-depth: 0, or git fetch --unshallow --tags)',
    }
  // Both fail closed: a null HEAD would match every tag that rev-list cannot
  // resolve (null === null) and skip it, and an unreadable tag list would read
  // as "no earlier release".
  const head = run(['rev-parse', 'HEAD'])
  if (head === null)
    return {
      kind: 'error',
      detail: 'git cannot resolve HEAD, so the previous release cannot be read',
    }
  const tagList = run(['tag', '--list', 'platform/v*', '--merged', 'HEAD', '--sort=-v:refname'])
  if (tagList === null)
    return {
      kind: 'error',
      detail: 'git cannot list the platform/v* tags, so the previous release cannot be read',
    }
  const tags = tagList
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
  for (const tag of tags) {
    if (run(['rev-list', '-n', '1', tag]) === head) continue
    // "predates licensing" only when git can read the tag's tree and the file
    // is not in it. Any git error (a corrupt object, a partial clone with no
    // network, a permissions problem) fails closed instead of skipping the
    // monotonic comparison.
    const listed = run(['ls-tree', '--name-only', tag, '--', REVOCATIONS_SOURCE])
    if (listed === null)
      return {
        kind: 'error',
        detail: `git cannot read the tree of ${tag}, so its revocation list cannot be read`,
      }
    if (listed === '')
      return { kind: 'none', note: `${tag} predates licensing (it has no ${REVOCATIONS_SOURCE})` }
    const source = run(['show', `${tag}:${REVOCATIONS_SOURCE}`])
    if (source === null)
      return {
        kind: 'error',
        detail: `${tag} has ${REVOCATIONS_SOURCE}, but git cannot read it`,
      }
    const token = extractRevocationToken(source)
    if (token === undefined)
      return {
        kind: 'error',
        detail: `${tag}:${REVOCATIONS_SOURCE} assigns no readable REVOCATION_LIST_TOKEN`,
      }
    if (token === null) return { kind: 'none', note: `${tag} shipped no revocation list` }
    const iat = decodeRevocationIat(token)
    return iat
      ? { kind: 'found', tag, iat }
      : { kind: 'error', detail: `the revocation list in ${tag} cannot be decoded` }
  }
  return { kind: 'none', note: 'no earlier platform/v* release to compare with' }
}

/** A release never ships an older list than the previous release did: an older list can un-revoke a licence (review A3 #12). */
export function checkRevocationMonotonic(
  currentIat: string,
  previous: PreviousList,
): ReleaseReport {
  if (previous.kind === 'error')
    return {
      problems: [
        {
          rule: 'revocations-history',
          detail: `cannot compare with the previous release's revocation list: ${previous.detail}`,
        },
      ],
      warnings: [],
      notes: [],
    }
  if (previous.kind === 'none') return { problems: [], warnings: [], notes: [previous.note] }
  if (Date.parse(currentIat) < Date.parse(previous.iat))
    return {
      problems: [
        {
          rule: 'revocations-regressed',
          detail: `the revocation list is signed ${currentIat}, older than the one ${previous.tag} shipped (${previous.iat}) — get the current list from the license service`,
        },
      ],
      warnings: [],
      notes: [],
    }
  return {
    problems: [],
    warnings: [],
    notes: [`revocation list ${currentIat} is not older than ${previous.tag}'s (${previous.iat})`],
  }
}

export function checkRelease(input: {
  prod: KeyMap
  revocationsSource: string
  now: Date
  verify: ReleaseVerifyRevocations
  git: Git
}): ReleaseReport {
  const out: ReleaseReport = {
    problems: [...placeholderProblems(input.prod)],
    warnings: [],
    notes: [],
  }
  const list = checkReleaseRevocationList(
    extractRevocationToken(input.revocationsSource),
    input.prod,
    input.now,
    input.verify,
  )
  out.problems.push(...list.problems)
  out.warnings.push(...list.warnings)
  if (list.iat !== undefined) {
    const mono = checkRevocationMonotonic(list.iat, previousRevocationList(input.git))
    out.problems.push(...mono.problems)
    out.warnings.push(...mono.warnings)
    out.notes.push(...mono.notes)
  }
  return out
}

/** --release as main() runs it: the committed key map and list text, verified with the token package's SOURCE. */
export async function runReleaseChecks(
  now = new Date(),
  git: Git = defaultGit,
): Promise<ReleaseReport> {
  const { PRODUCTION_KEYS } =
    (await import('../packages/shared/src/licensing/keys.production.ts')) as {
      PRODUCTION_KEYS: KeyMap
    }
  const { verifyRevocationList } = (await import('../packages/license-token/src/index.ts')) as {
    verifyRevocationList: ReleaseVerifyRevocations
  }
  const revocationsSource = readFileSync(join(REPO_ROOT, REVOCATIONS_SOURCE), 'utf8')
  return checkRelease({
    prod: PRODUCTION_KEYS,
    revocationsSource,
    now,
    verify: verifyRevocationList,
    git,
  })
}

export function parseArgs(argv: readonly string[]): {
  soft: boolean
  artifacts: string[]
  release: boolean
} {
  const artifacts: string[] = []
  let soft = false
  let release = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--soft') {
      soft = true
      continue
    }
    if (a === '--release') {
      release = true
      continue
    }
    if (a === '--artifact') {
      const v = argv[i + 1]
      if (!v || v.startsWith('--')) throw new Error('--artifact needs a directory')
      artifacts.push(v)
      i++
      continue
    }
    throw new Error(
      `unknown argument ${a} (supported: --artifact <dir>, repeatable; --release; --soft)`,
    )
  }
  return { soft, artifacts, release }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { PRODUCTION_KEYS } =
    (await import('../packages/shared/src/licensing/keys.production.ts')) as {
      PRODUCTION_KEYS: KeyMap
    }
  const { DEV_KEYS } = (await import('../packages/shared/src/licensing/keys.dev.ts')) as {
    DEV_KEYS: KeyMap
  }
  const problems: KeyProblem[] = [...checkKeySets(PRODUCTION_KEYS, DEV_KEYS)]

  if (args.artifacts.length === 0) {
    // Source mode. Reads the dev fixture, which only a checkout has.
    const fixture = JSON.parse(readFileSync(DEV_FIXTURE, 'utf8')) as {
      kid: string
      publicKey: string
    }
    problems.push(...checkDevFixture(DEV_KEYS, fixture))
    for (const [file, exportName] of KEY_FILES) {
      const path = join(SHARED_SRC, 'licensing', file)
      problems.push(
        ...checkKeyFileShape(readFileSync(path, 'utf8'), exportName, relative(REPO_ROOT, path)),
      )
    }
    const sources = readArtifact(SHARED_SRC)
    problems.push(...scanDevModuleImports(sources), ...scanSourceLiterals(sources))
    const { REVOCATION_LIST_TOKEN } =
      (await import('../packages/shared/src/licensing/revocations.ts')) as {
        REVOCATION_LIST_TOKEN: string | null
      }
    const { verifyRevocationList } = (await import('../packages/license-token/src/index.ts')) as {
      verifyRevocationList: VerifyRevocations
    }
    // Under --release, checkReleaseRevocationList reports the same list with
    // more rules; checking it here too would report an invalid list twice.
    if (!args.release) {
      problems.push(
        ...checkRevocationList(REVOCATION_LIST_TOKEN, PRODUCTION_KEYS, verifyRevocationList),
      )
    }
  } else {
    let keyrings = 0
    for (const dir of args.artifacts) {
      const abs = resolve(process.cwd(), dir)
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        problems.push({ rule: 'artifact-missing', detail: `${dir} is not a directory` })
        continue
      }
      for (const file of iterateArtifact(abs)) {
        problems.push(
          ...scanArtifact([file], DEV_KEYS).map((p) => ({ ...p, detail: `${dir}/${p.detail}` })),
        )
      }
      const keyring = join(abs, 'licensing', 'keyring.js')
      if (existsSync(keyring)) {
        keyrings++
        problems.push(...checkArtifactKeyring(loadCompiledKeyring(keyring)))
      }
    }
    if (keyrings === 0) {
      problems.push({
        rule: 'artifact-no-keyring',
        detail:
          'no --artifact directory holds licensing/keyring.js; point one at packages/shared/dist',
      })
    }
  }

  const mode = `${args.artifacts.length > 0 ? `${args.artifacts.length} artifact dir(s)` : 'source'}${args.release ? ' + release' : ''}`
  console.log(`Checking the license key ring (${mode}).`)

  // --release (Task A3.3): placeholders, and the signed revocation list.
  const warnings: string[] = []
  if (args.release) {
    const release = await runReleaseChecks()
    problems.push(...release.problems)
    warnings.push(...release.warnings)
    for (const note of release.notes) console.log(`  · ${note}`)
  }
  for (const w of warnings) console.warn(`  ⚠ ${w}`)

  if (problems.length > 0) {
    console.error(`\n✖ ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  - [${p.rule}] ${p.detail}`)
    if (!args.soft) process.exitCode = 1
    return
  }
  console.log(
    `✓ Trusts exactly ${EXPECTED_PRODUCTION_KIDS.join(', ')}${args.artifacts.length > 0 ? ', with no development key in the output' : ''}${args.release ? '; release: no placeholders, revocation list verified and not older than the last release' : ''}.`,
  )
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
}
