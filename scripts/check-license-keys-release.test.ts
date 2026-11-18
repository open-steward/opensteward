/**
 * check-license-keys --release (Task A3.3). A release ships no placeholder
 * key. Its revocation list must be present, verify under a PRODUCTION kid with
 * the revocations assertion, not be dated ahead, and never be older than the
 * list the previous platform/v* release shipped. A list older than 90 days only
 * warns (P9). A separate file from A2c-2's check-license-keys.test.ts, so the
 * two cannot collide on helper names.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkRelease,
  checkReleaseRevocationList,
  checkRevocationMonotonic,
  decodeRevocationIat,
  EXPECTED_PRODUCTION_KIDS,
  extractRevocationToken,
  parseArgs,
  placeholderProblems,
  previousRevocationList,
  REVOCATION_WARN_AGE_DAYS,
  REVOCATIONS_SOURCE,
  runReleaseChecks,
  type Git,
} from './check-license-keys.ts'
import {
  assembleToken,
  buildSigningInput,
  encodeBase64Url,
  LICENSE_ASSERTION,
  pae,
  verifyRevocationList,
} from '../packages/license-token/src/index.ts'

const DAY = 86_400_000
const NOW = new Date('2027-03-01T00:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const kp = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { pub: publicKey.export({ format: 'jwk' }).x as string, privateKey }
}
const PAIRS = Object.fromEntries(EXPECTED_PRODUCTION_KIDS.map((k) => [k, kp()]))
const REAL: Record<string, string> = Object.fromEntries(
  Object.entries(PAIRS).map(([k, v]) => [k, v.pub]),
)
const PH: Record<string, string> = Object.fromEntries(
  EXPECTED_PRODUCTION_KIDS.map((k) => [k, `PLACEHOLDER:${k}`]),
)
const rules = (ps: Array<{ rule: string }>) => ps.map((p) => p.rule).sort()
const key = (kid: string): KeyObject => PAIRS[kid]!.privateKey

function revList(kid: string, k: KeyObject, iatMs: number, revoked: string[] = []): string {
  const payload = { ver: 1 as const, iat: iso(iatMs), revoked }
  const footer = { kid }
  const sig = sign(null, buildSigningInput(payload, footer, 'revocations'), k)
  return assembleToken(payload, footer, new Uint8Array(sig), 'revocations')
}
const srcFor = (token: string | null) =>
  `export const REVOCATION_LIST_TOKEN: string | null =\n  ${token === null ? 'null' : `'${token}'`}\n`
/** A git that answers the six commands previousRevocationList uses. */
function fakeGit(o: {
  shallow?: boolean
  head?: string
  /** A tag without `source` has no revocations.ts in its tree (it predates licensing). */
  tags?: Record<string, { commit: string; source?: string }>
  /** Make one command throw, as a broken, corrupt or partial git would. */
  fail?: 'head' | 'tags' | 'tree' | 'show'
}): Git {
  return (args) => {
    const [cmd, ...rest] = args
    if (cmd === 'rev-parse' && rest[0] === '--is-shallow-repository')
      return o.shallow ? 'true' : 'false'
    if (cmd === 'rev-parse' && rest[0] === 'HEAD') {
      if (o.fail === 'head') throw new Error("fatal: ambiguous argument 'HEAD'")
      return o.head ?? 'head0'
    }
    if (cmd === 'tag') {
      if (o.fail === 'tags') throw new Error('fatal: malformed object name HEAD')
      return Object.keys(o.tags ?? {})
        .sort()
        .reverse()
        .join('\n')
    }
    if (cmd === 'rev-list') return o.tags?.[rest[2]!]?.commit ?? ''
    if (cmd === 'ls-tree') {
      if (o.fail === 'tree') throw new Error('fatal: not a tree object')
      return o.tags?.[rest[1]!]?.source === undefined ? '' : rest[3]!
    }
    if (cmd === 'show') {
      if (o.fail === 'show') throw new Error('error: unable to read sha1 file')
      const source = o.tags?.[rest[0]!.split(':')[0]!]?.source
      if (source === undefined) throw new Error('fatal: path does not exist')
      return source
    }
    throw new Error(`unexpected: git ${args.join(' ')}`)
  }
}

test('[L7:B02] a release refuses every placeholder', () => {
  assert.deepEqual(rules(placeholderProblems(PH)), Array(5).fill('placeholder'))
  assert.deepEqual(placeholderProblems(REAL), [])
})

test('the revocation list must be present and readable', () => {
  assert.deepEqual(
    rules(checkReleaseRevocationList(null, REAL, NOW, verifyRevocationList).problems),
    ['revocations-missing'],
  )
  assert.deepEqual(
    rules(checkReleaseRevocationList(undefined, REAL, NOW, verifyRevocationList).problems),
    ['revocations-unreadable'],
  )
})

test('a list signed by any production kid passes, reserve kids included (P9)', () => {
  for (const kid of ['k2026a', 'r2026b']) {
    const r = checkReleaseRevocationList(
      revList(kid, key(kid), NOW.getTime() - 10 * DAY),
      REAL,
      NOW,
      verifyRevocationList,
    )
    assert.deepEqual(r.problems, [], kid)
    assert.deepEqual(r.warnings, [], kid)
    assert.equal(r.iat, iso(NOW.getTime() - 10 * DAY))
  }
})

test('a list from an unshipped key, a dev kid, or a placeholder kid is refused', () => {
  const foreign = revList('k2026a', kp().privateKey, NOW.getTime())
  const dev = revList('dev1', kp().privateKey, NOW.getTime())
  for (const t of [foreign, dev])
    assert.deepEqual(
      rules(checkReleaseRevocationList(t, REAL, NOW, verifyRevocationList).problems),
      ['revocations-invalid'],
    )
  const underPlaceholder = revList('k2026a', key('k2026a'), NOW.getTime())
  const prod = { ...REAL, k2026a: 'PLACEHOLDER:k2026a' }
  assert.deepEqual(
    rules(checkReleaseRevocationList(underPlaceholder, prod, NOW, verifyRevocationList).problems),
    ['revocations-invalid'],
  )
})

test('a list signed for the license purpose (wrong implicit assertion) is refused', () => {
  const m = Buffer.from(JSON.stringify({ ver: 1, iat: iso(NOW.getTime()), revoked: [] }))
  const f = Buffer.from(JSON.stringify({ kid: 'k2026a' }))
  const s = sign(
    null,
    pae([Buffer.from('v4.public.'), m, f, Buffer.from(LICENSE_ASSERTION)]),
    key('k2026a'),
  )
  const t = `v4.public.${encodeBase64Url(Buffer.concat([m, s]))}.${encodeBase64Url(f)}`
  assert.deepEqual(rules(checkReleaseRevocationList(t, REAL, NOW, verifyRevocationList).problems), [
    'revocations-invalid',
  ])
})

test(`older than ${REVOCATION_WARN_AGE_DAYS} days only warns; dated ahead is refused`, () => {
  const old = checkReleaseRevocationList(
    revList('k2026a', key('k2026a'), NOW.getTime() - 91 * DAY),
    REAL,
    NOW,
    verifyRevocationList,
  )
  assert.deepEqual(old.problems, [])
  assert.equal(old.warnings.length, 1)
  assert.match(old.warnings[0]!, /91 days old/)
  const ahead = checkReleaseRevocationList(
    revList('k2026a', key('k2026a'), NOW.getTime() + 2 * DAY),
    REAL,
    NOW,
    verifyRevocationList,
  )
  assert.deepEqual(rules(ahead.problems), ['revocations-future'])
})

test('the token is read from the file text, in every literal form', () => {
  assert.equal(extractRevocationToken(srcFor(null)), null)
  assert.equal(
    extractRevocationToken("export const REVOCATION_LIST_TOKEN: string | null = 'v4.public.a'"),
    'v4.public.a',
  )
  assert.equal(
    extractRevocationToken('export const REVOCATION_LIST_TOKEN = "v4.public.a"'),
    'v4.public.a',
  )
  assert.equal(
    extractRevocationToken('export const REVOCATION_LIST_TOKEN =\n  `v4.public.a`'),
    'v4.public.a',
  )
  assert.equal(extractRevocationToken('export const SOMETHING_ELSE = null'), undefined)
})

test('decodeRevocationIat reads iat without verifying, and refuses anything else', () => {
  assert.equal(
    decodeRevocationIat(revList('k2026a', kp().privateKey, NOW.getTime())),
    iso(NOW.getTime()),
  )
  for (const bad of [
    '',
    'v4.public.',
    'v3.public.AAAA',
    `v4.public.${Buffer.alloc(64).toString('base64url')}`,
  ])
    assert.equal(decodeRevocationIat(bad), null, bad)
})

test('the previous release: no git or a shallow clone fails closed; the tag on HEAD is skipped', () => {
  assert.equal(previousRevocationList(fakeGit({ shallow: true })).kind, 'error')
  assert.equal(
    previousRevocationList(() => {
      throw new Error('git: command not found')
    }).kind,
    'error',
  )
  assert.deepEqual(previousRevocationList(fakeGit({})), {
    kind: 'none',
    note: 'no earlier platform/v* release to compare with',
  })
  // A git that cannot resolve HEAD or list tags fails closed too, rather than
  // read as "no earlier release" (an empty tag list) or skip every tag
  // (null HEAD === null rev-list).
  const earlier = { 'platform/v1.0.0': { commit: 'c1', source: srcFor(null) } }
  for (const fail of ['head', 'tags'] as const) {
    const r = previousRevocationList(fakeGit({ tags: earlier, fail }))
    assert.equal(r.kind, 'error', fail)
    assert.match(
      (r as { detail: string }).detail,
      /cannot (resolve HEAD|list the platform\/v\* tags)/,
    )
  }
  const releasing = revList('k2026a', key('k2026a'), NOW.getTime())
  const older = revList('k2026a', key('k2026a'), NOW.getTime() - 30 * DAY)
  const git = fakeGit({
    head: 'c3',
    tags: {
      'platform/v1.3.0': { commit: 'c3', source: srcFor(releasing) }, // the tag images.yml is building
      'platform/v1.2.0': { commit: 'c2', source: srcFor(older) },
    },
  })
  assert.deepEqual(previousRevocationList(git), {
    kind: 'found',
    tag: 'platform/v1.2.0',
    iat: iso(NOW.getTime() - 30 * DAY),
  })
  assert.equal(
    previousRevocationList(fakeGit({ tags: { 'platform/v1.0.0': { commit: 'c1' } } })).kind,
    'none',
  )
  assert.equal(
    previousRevocationList(
      fakeGit({ tags: { 'platform/v1.0.0': { commit: 'c1', source: srcFor(null) } } }),
    ).kind,
    'none',
  )
  assert.equal(
    previousRevocationList(
      fakeGit({ tags: { 'platform/v1.0.0': { commit: 'c1', source: 'export const X = 1' } } }),
    ).kind,
    'error',
  )
})

test('the previous release: only a file really absent from the tag reads as "predates licensing" (m30)', () => {
  const listed = { 'platform/v1.0.0': { commit: 'c1', source: srcFor(null) } }
  // The tag's tree cannot be read, or the file is listed but its blob cannot:
  // a git error, never "no earlier list", so the comparison is not skipped.
  for (const fail of ['tree', 'show'] as const) {
    const r = previousRevocationList(fakeGit({ tags: listed, fail }))
    assert.equal(r.kind, 'error', fail)
    assert.match((r as { detail: string }).detail, /platform\/v1\.0\.0/, fail)
  }
  assert.deepEqual(
    previousRevocationList(fakeGit({ tags: { 'platform/v1.0.0': { commit: 'c1' } } })),
    {
      kind: 'none',
      note: `platform/v1.0.0 predates licensing (it has no ${REVOCATIONS_SOURCE})`,
    },
  )
})

test('the previous release, against a real git: a missing file is "none", a corrupt blob fails closed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lic-release-git-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  // A git hook exports GIT_DIR and friends: without dropping them every
  // command below would act on the repository running the tests. Nor may the
  // developer's own config leak in (tag.gpgSign makes `git tag` want a
  // message and a key; a template dir can add hooks): no global or system
  // config, and the overrides below on every command that writes.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const git: Git = (args) =>
    execFileSync('git', [...args], {
      cwd: dir,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  const cfg = [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.invalid',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
  ]
  git([...cfg, 'init', '-q'])
  writeFileSync(join(dir, 'README'), 'before licensing\n')
  git(['add', 'README'])
  git([...cfg, 'commit', '-q', '-m', 'v1'])
  git([...cfg, 'tag', 'platform/v1.0.0'])
  writeFileSync(join(dir, 'README'), 'still before licensing\n')
  git([...cfg, 'commit', '-q', '-am', 'head'])
  assert.deepEqual(previousRevocationList(git), {
    kind: 'none',
    note: `platform/v1.0.0 predates licensing (it has no ${REVOCATIONS_SOURCE})`,
  })

  const previous = revList('k2026a', key('k2026a'), NOW.getTime() - 10 * DAY)
  mkdirSync(join(dir, dirname(REVOCATIONS_SOURCE)), { recursive: true })
  writeFileSync(join(dir, REVOCATIONS_SOURCE), srcFor(previous))
  git(['add', REVOCATIONS_SOURCE])
  git([...cfg, 'commit', '-q', '-m', 'v2'])
  git([...cfg, 'tag', 'platform/v2.0.0'])
  writeFileSync(join(dir, 'README'), 'after v2\n')
  git([...cfg, 'commit', '-q', '-am', 'head'])
  assert.deepEqual(previousRevocationList(git), {
    kind: 'found',
    tag: 'platform/v2.0.0',
    iat: iso(NOW.getTime() - 10 * DAY),
  })

  // Corrupt the object store: the list's blob is gone, as in a partial clone
  // with no network. git show fails; the gate must not read that as "none".
  const blob = git(['rev-parse', `platform/v2.0.0:${REVOCATIONS_SOURCE}`])
  rmSync(join(dir, '.git', 'objects', blob.slice(0, 2), blob.slice(2)))
  const r = previousRevocationList(git)
  assert.equal(r.kind, 'error')
  assert.match((r as { detail: string }).detail, /platform\/v2\.0\.0 has .*git cannot read it/)
})

test('[L7:B02] a release never ships an older list than the previous release (review A3 #12)', () => {
  const prev = { kind: 'found' as const, tag: 'platform/v1.2.0', iat: '2027-02-01T00:00:00Z' }
  assert.deepEqual(rules(checkRevocationMonotonic('2027-01-31T23:59:59Z', prev).problems), [
    'revocations-regressed',
  ])
  assert.deepEqual(checkRevocationMonotonic('2027-02-01T00:00:00Z', prev).problems, []) // carried forward
  assert.deepEqual(checkRevocationMonotonic('2027-02-15T00:00:00Z', prev).problems, [])
  assert.deepEqual(
    rules(
      checkRevocationMonotonic('2027-02-15T00:00:00Z', { kind: 'error', detail: 'shallow' })
        .problems,
    ),
    ['revocations-history'],
  )
  assert.deepEqual(
    checkRevocationMonotonic('2027-02-15T00:00:00Z', { kind: 'none', note: 'first release' })
      .problems,
    [],
  )
})

test('checkRelease combines the three, and asks git only when there is a list to compare', () => {
  let calls = 0
  const counting: Git = (a) => {
    calls++
    return fakeGit({})(a)
  }
  const r = checkRelease({
    prod: PH,
    revocationsSource: srcFor(null),
    now: NOW,
    verify: verifyRevocationList,
    git: counting,
  })
  assert.deepEqual(
    rules(r.problems),
    [...Array(5).fill('placeholder'), 'revocations-missing'].sort(),
  )
  assert.equal(calls, 0)
  const current = revList('k2026b', key('k2026b'), NOW.getTime() - 5 * DAY)
  const previous = revList('k2026a', key('k2026a'), NOW.getTime() - 1 * DAY)
  const git = fakeGit({ tags: { 'platform/v2.0.0': { commit: 'c9', source: srcFor(previous) } } })
  const r2 = checkRelease({
    prod: REAL,
    revocationsSource: srcFor(current),
    now: NOW,
    verify: verifyRevocationList,
    git,
  })
  assert.deepEqual(rules(r2.problems), ['revocations-regressed'])
})

test('--release is its own flag', () => {
  assert.equal(parseArgs(['--release']).release, true)
  assert.equal(parseArgs([]).release, false)
})

test('the committed tree is releasable (A3.9): five real keys and a list a production kid signed', async () => {
  const { PRODUCTION_KEYS } = await import('../packages/shared/src/licensing/keys.production.ts')
  const src = readFileSync(
    join(import.meta.dirname, '..', 'packages/shared/src/licensing/revocations.ts'),
    'utf8',
  )
  // No platform/v* tag: no earlier release to compare the list with. A list
  // older than 90 days only warns, so the problems stay empty as it ages.
  const r = checkRelease({
    prod: PRODUCTION_KEYS,
    revocationsSource: src,
    now: new Date(),
    verify: verifyRevocationList,
    git: fakeGit({}),
  })
  assert.deepEqual(r.problems, [])
  assert.equal(r.notes.length, 1, 'the list was compared with the (absent) previous release')
})

// main() is what `pnpm check:license-keys:release`, release.ts and images.yml
// run. The functions above are tested directly; this pins that the CLI really
// applies them, whatever the tree holds (red before A3.9, green after): every
// release problem is printed and fails the run, and no success line follows.
test('the CLI applies the release checks: `check-license-keys.ts --release` reports and fails on them', async () => {
  const expected = await runReleaseChecks()
  const repoRoot = join(import.meta.dirname, '..')
  const res = spawnSync(
    join(repoRoot, 'node_modules', '.bin', 'tsx'),
    [join(import.meta.dirname, 'check-license-keys.ts'), '--release'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
  )
  const out = `${res.stdout}\n${res.stderr}`
  assert.equal(res.error, undefined, out)
  assert.match(res.stdout, /Checking the license key ring \(source \+ release\)\./, out)
  for (const p of expected.problems) assert.ok(res.stderr.includes(`[${p.rule}] ${p.detail}`), out)
  for (const w of expected.warnings) assert.ok(res.stderr.includes(w), out)
  if (expected.problems.length > 0) {
    assert.equal(res.status, 1, out)
    assert.doesNotMatch(res.stdout, /✓/, out)
  } else {
    assert.equal(res.status, 0, out)
    assert.match(res.stdout, /release: no placeholders, revocation list verified/, out)
  }
})

test('the release gate runs on an unbuilt checkout: it imports no workspace package by name', () => {
  const src = readFileSync(join(import.meta.dirname, 'check-license-keys.ts'), 'utf8')
  assert.doesNotMatch(
    src,
    /from\s+['"]@opensteward\//,
    'import ../packages/<pkg>/src/… instead (images.yml prepare builds nothing)',
  )
  assert.doesNotMatch(src, /import\(\s*['"]@opensteward\//)
})
