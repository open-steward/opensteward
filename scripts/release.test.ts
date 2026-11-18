/**
 * The release gates (Task A3.7). release.ts refuses an image-producing scope
 * while the licence keys or revocation list are not releasable. images.yml
 * runs the same gate in its prepare job (tags pushed by hand never pass
 * through release.ts) and probes every pushed digest before it is exported,
 * so a failing image never gets a tag. No workflow builds a development-
 * profile image (D-E).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import ts from 'typescript'
import {
  assertLicenseReleasable,
  assertNoUntrackedFiles,
  LICENSE_GATED_SCOPES,
  LICENSE_GATE_COMMANDS,
} from './release.ts'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const never = (): never => {
  throw new Error('unexpected exit')
}
type Step = {
  name?: string
  id?: string
  uses?: string
  run?: string
  if?: unknown
  'continue-on-error'?: unknown
  with?: Record<string, unknown>
  env?: Record<string, string>
}
type Job = {
  if?: unknown
  'continue-on-error'?: unknown
  permissions?: unknown
  steps: Step[]
}
const images = load(read('.github/workflows/images.yml')) as { jobs: Record<string, Job> }
/** A step or job its YAML keys switch off: a false `if`, or a failure that does not fail the job. */
function assertLive(what: string, o: { if?: unknown; 'continue-on-error'?: unknown }): void {
  assert.equal(o.if, undefined, `${what} is conditional (\`if: ${String(o.if)}\`)`)
  assert.equal(o['continue-on-error'], undefined, `${what} sets continue-on-error`)
}
const runLines = (step: Step): string[] =>
  (step.run ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

test('[L7:B02] every scope whose tag builds an image is gated, and shared too', () => {
  const all = /ALL='(\[[^']*\])'/.exec(read('.github/workflows/images.yml'))
  assert.ok(all, 'images.yml no longer declares ALL=[…] (parser guard)')
  for (const service of JSON.parse(all[1]!) as string[])
    assert.ok(LICENSE_GATED_SCOPES.has(service), service)
  assert.deepEqual([...LICENSE_GATED_SCOPES].sort(), [
    'admin',
    'admin-api',
    'docs-server',
    'integration-server',
    'platform',
    'shared',
    'webhook-gateway',
  ])
})

test('a gated scope runs the release key check and the bypass guard, in that order', () => {
  const ran: string[] = []
  assertLicenseReleasable('platform', { exec: (c) => void ran.push(c), exit: never })
  assert.deepEqual(ran, [...LICENSE_GATE_COMMANDS])
  assert.deepEqual(ran, ['pnpm run check:license-keys:release', 'pnpm run check:no-license-bypass'])
})

test('the gate commands name root scripts that run the release key check and the bypass guard', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts
  const named = LICENSE_GATE_COMMANDS.map((c) => /^pnpm run (\S+)$/.exec(c)?.[1])
  assert.deepEqual(named, ['check:license-keys:release', 'check:no-license-bypass'])
  assert.equal(scripts['check:license-keys:release'], 'tsx scripts/check-license-keys.ts --release')
  assert.equal(scripts['check:no-license-bypass'], 'tsx scripts/check-no-license-bypass.ts')
})

test('a failing check stops the release with exit code 1', () => {
  let code: number | undefined
  assert.throws(
    () =>
      assertLicenseReleasable('integration-server', {
        exec: () => {
          throw new Error('placeholder')
        },
        exit: (c) => {
          code = c
          throw new Error('exited')
        },
      }),
    /exited/,
  )
  assert.equal(code, 1)
})

test('the failure names the scope with the right article (review m91)', (t) => {
  const said: string[] = []
  t.mock.method(console, 'error', (m: string) => void said.push(m))
  const fail = {
    exec: () => {
      throw new Error('placeholder')
    },
    exit: (): never => {
      throw new Error('exited')
    },
  }
  for (const scope of ['integration-server', 'admin', 'shared', 'platform']) {
    assert.throws(() => assertLicenseReleasable(scope, fail), /exited/)
  }
  assert.match(said[0]!, /\nAn integration-server release ships the licensing module/)
  assert.match(said[1]!, /\nAn admin release ships/)
  assert.match(said[2]!, /\nA shared release ships/)
  assert.match(said[3]!, /\nA platform release ships/)
})

test('ungated scopes skip it', () => {
  const ran: string[] = []
  assertLicenseReleasable('design-system', { exec: (c) => void ran.push(c), exit: never })
  assert.deepEqual(ran, [])
})

test('the gate runs after the CHANGELOG gate and before anything is written', () => {
  // Read from the syntax tree, not the text: a commented-out call is not a call
  // (review m86). Each must be a statement of main() itself, so it always runs.
  const file = ts.createSourceFile('release.ts', read('scripts/release.ts'), ts.ScriptTarget.Latest)
  const main = file.statements.find(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'main',
  )
  assert.ok(main?.body, 'release.ts declares function main() (parser guard)')
  const callNodes = (node: ts.Node): ts.CallExpression[] => {
    const found: ts.CallExpression[] = []
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) found.push(n)
      ts.forEachChild(n, visit)
    }
    visit(node)
    return found
  }
  const calls = (node: ts.Node): string[] => callNodes(node).map((c) => c.expression.getText(file))
  const statements = main.body.statements
  const topLevelCall = (name: string, arg: string) =>
    statements.findIndex(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        s.expression.expression.getText(file) === name &&
        s.expression.arguments.map((a) => a.getText(file)).join(',') === arg,
    )
  const changelog = topLevelCall('assertChangelogEntry', 'newVersion')
  const gate = topLevelCall('assertLicenseReleasable', 'scope')
  const write = statements.findIndex((s) => calls(s).includes('writeFileSync'))
  assert.ok(changelog !== -1, 'main() calls assertChangelogEntry(newVersion) unconditionally')
  assert.ok(gate !== -1, 'main() calls assertLicenseReleasable(scope) unconditionally')
  assert.ok(write !== -1, 'main() writes the version (parser guard)')
  assert.ok(changelog < gate && gate < write, 'order: changelog → license gate → write')
  // What writes or runs: an fs write or a child_process call, or any function
  // of release.ts that reaches one, found transitively, so its run() wrapper
  // counts (review r19).
  const EFFECTS =
    /^(?:writeFileSync|appendFileSync|copyFileSync|renameSync|rmSync|unlinkSync|mkdirSync|execSync|execFileSync|spawnSync|exec|execFile|spawn|fork)$/
  const isEffect = (callee: string) => EFFECTS.test(callee.split('.').pop()!)
  const fns = new Map(
    file.statements
      .filter(ts.isFunctionDeclaration)
      .filter((f) => f.name && f.body)
      .map((f) => [f.name!.text, f.body!] as const),
  )
  const effectful = new Set<string>()
  for (let grew = true; grew;) {
    grew = false
    for (const [name, body] of fns) {
      if (effectful.has(name) || !calls(body).some((c) => isEffect(c) || effectful.has(c))) continue
      effectful.add(name)
      grew = true
    }
  }
  assert.ok(effectful.has('run'), 'release.ts runs commands through run() (parser guard)')
  // The one command main() may run before the gate only reads: is the tree clean?
  const READ_ONLY = new Set(["run('git diff --quiet HEAD')"])
  const beforeGate = statements
    .slice(0, gate)
    .flatMap(callNodes)
    .filter((c) => {
      const callee = c.expression.getText(file)
      return isEffect(callee) || effectful.has(callee)
    })
    .map((c) => c.getText(file))
    .filter((text) => !READ_ONLY.has(text))
  assert.deepEqual(beforeGate, [], 'nothing is written or run before the license gate')
})

test('untracked files stop the release, named, with exit code 1: git add -A would commit them', (t) => {
  const said: string[] = []
  t.mock.method(console, 'error', (m: string) => void said.push(m))
  let code: number | undefined
  const exit = (c: number): never => {
    code = c
    throw new Error('exited')
  }
  const status = ' M VERSION\n?? apps/integration-server/license.key\n?? AGENTS.md'
  assert.throws(() => assertNoUntrackedFiles({ read: () => status, exit }), /exited/)
  assert.equal(code, 1)
  assert.match(said.join('\n'), /\n {2}apps\/integration-server\/license\.key\n {2}AGENTS\.md\n/)
  assert.doesNotMatch(said.join('\n'), /VERSION/)
  // Tracked changes are the other check's (git diff --quiet HEAD); nothing untracked passes.
  assertNoUntrackedFiles({ read: () => ' M VERSION', exit: never })
  assertNoUntrackedFiles({ read: () => '', exit: never })
})

test('untracked files, against a real git: listed even inside a new folder, ignored ones left out', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'release-untracked-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  // No GIT_* from a hook (they would point at this repository) and no developer config.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const cfg = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false']
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' })
  git([...cfg, 'init', '-q'])
  writeFileSync(join(dir, '.gitignore'), '/ignored.key\n')
  git(['add', '.gitignore'])
  git([...cfg, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'init'])
  writeFileSync(join(dir, 'ignored.key'), 'v4.public.ignored')
  mkdirSync(join(dir, 'apps', 'integration-server'), { recursive: true })
  writeFileSync(join(dir, 'apps', 'integration-server', 'license.key'), 'v4.public.untracked')
  const listed: string[] = []
  const read = (cmd: string) => execSync(cmd, { cwd: dir, env, encoding: 'utf8' }).trim()
  const exit = (): never => {
    throw new Error('exited')
  }
  t.mock.method(console, 'error', (m: string) => void listed.push(m))
  assert.throws(() => assertNoUntrackedFiles({ read, exit }), /exited/)
  assert.match(listed.join('\n'), /apps\/integration-server\/license\.key/)
  assert.doesNotMatch(listed.join('\n'), /ignored\.key/)
  rmSync(join(dir, 'apps'), { recursive: true })
  assertNoUntrackedFiles({ read, exit: never })
})

test('main() refuses untracked files before anything is written', () => {
  const file = ts.createSourceFile('release.ts', read('scripts/release.ts'), ts.ScriptTarget.Latest)
  const main = file.statements.find(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'main',
  )
  assert.ok(main?.body, 'release.ts declares function main() (parser guard)')
  const statements = main.body.statements
  const check = statements.findIndex(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isCallExpression(s.expression) &&
      s.expression.expression.getText(file) === 'assertNoUntrackedFiles' &&
      s.expression.arguments.length === 0,
  )
  const write = statements.findIndex((s) => /\bwriteFileSync\(/.test(s.getText(file)))
  assert.ok(check !== -1, 'main() calls assertNoUntrackedFiles() unconditionally')
  assert.ok(write !== -1, 'main() writes the version (parser guard)')
  assert.ok(check < write, 'the check runs before anything is written')
})

test('importing release.ts runs nothing (isMain guard)', () => {
  assert.match(read('scripts/release.ts'), /\nif \(isMain\) main\(\)\s*$/)
})

test('images.yml gates the release in prepare, before planning, with full tag history', () => {
  const prepare = images.jobs['prepare']!
  const steps = prepare.steps
  const checkout = steps.find((s) => s.uses?.startsWith('actions/checkout'))
  assert.equal(
    checkout?.with?.['fetch-depth'],
    0,
    'the monotonic revocation check reads the previous platform/v* tag',
  )
  const gate = steps.findIndex((s) => /check:license-keys:release/.test(s.run ?? ''))
  const plan = steps.findIndex((s) => s.id === 'plan')
  assert.ok(gate !== -1 && plan !== -1 && gate < plan, 'license gate before plan')
  // The same commands release.ts runs, spelled the same way (review m91).
  assert.deepEqual(runLines(steps[gate]!), [...LICENSE_GATE_COMMANDS])
  // Found by its run text, so also check nothing switches it off (review m87).
  assertLive('prepare', prepare)
  assertLive('the license gate step', steps[gate]!)
})

test('the prepare job runs third-party code on the host: it holds a checkout token only (review m88)', () => {
  assert.deepEqual(images.jobs['prepare']!.permissions, { contents: 'read' })
})

test('[L7:V05] images.yml probes every pushed digest before exporting it, long before any tag', () => {
  const steps = images.jobs['build']!.steps
  const build = steps.findIndex((s) => s.id === 'build')
  const probe = steps.findIndex((s) => /image-license-probe\.cjs/.test(s.run ?? ''))
  const exported = steps.findIndex((s) => s.name === 'Export digest')
  assert.ok(build !== -1 && build < probe && probe < exported, 'build → probe → export digest')
  const step = steps[probe]!
  assertLive('build', images.jobs['build']!)
  assertLive('the license probe step', step)
  assert.match(step.run!, /--network none/)
  assert.match(step.run!, / - --release /)
  assert.match(step.run!, /org\.opensteward\.build-profile/)
  assert.match(step.env?.['DIGEST'] ?? '', /steps\.build\.outputs\.digest/)
  assert.doesNotMatch(
    JSON.stringify(images.jobs['publish']),
    /image-license-probe/,
    'publish tags first: too late to probe',
  )
})

test('no workflow builds a development-profile image (D-E)', () => {
  // Every workflow, not a list that a new one is missing from (review m91).
  const workflows = readdirSync(join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f))
  assert.ok(workflows.includes('images.yml') && workflows.includes('test.yml'), 'parser guard')
  for (const f of workflows)
    assert.doesNotMatch(read(`.github/workflows/${f}`), /OPENSTEWARD_BUILD_PROFILE/, f)
})

test('a build-profile switch reuses the runtime prod install layer (review m21)', () => {
  const lines = read('Dockerfile').split('\n')
  const runtime = lines.findIndex((l) => /^FROM node:/.test(l) && !/\bAS builder\b/.test(l))
  const install = lines.findIndex(
    (l, i) => i > runtime && /pnpm install --frozen-lockfile --prod/.test(l),
  )
  // What the builder's production profile deletes: the content that differs by profile.
  const stripped = lines
    .slice(0, runtime)
    .map((l) => /^\s*rm -f (\S+)/.exec(l)?.[1])
    .filter((p): p is string => p !== undefined)
  assert.ok(runtime !== -1 && install !== -1 && stripped.length > 0, 'markers')
  // BuildKit keys a COPY --from on the content it copies: one that takes in a
  // profile-dependent path before the install makes a profile switch redo it.
  const copies = lines
    .map((l, i) => ({ i, src: /^COPY --from=builder (?:--\S+ )*(\S+)/.exec(l)?.[1] }))
    .filter((c) => c.i > runtime && c.src !== undefined)
    .filter((c) => stripped.some((p) => p.startsWith(c.src!.replace(/^\/app\//, ''))))
  assert.ok(copies.length > 0, 'the runtime stage copies the stripped directory (parser guard)')
  for (const c of copies)
    assert.ok(c.i > install, `Dockerfile:${c.i + 1} copies ${c.src} before the prod install`)
  // An ARG's value is in the cache key of every RUN below it.
  const arg = lines.findIndex((l, i) => i > runtime && /^ARG OPENSTEWARD_BUILD_PROFILE\b/.test(l))
  assert.ok(arg > install, 'the runtime profile ARG is declared after the prod install')
})

test('a new GIT_SHA or BUILD_TIME reuses every runtime RUN layer (review r21)', () => {
  const lines = read('Dockerfile').split('\n')
  const runtime = lines.findIndex((l) => /^FROM node:/.test(l) && !/\bAS builder\b/.test(l))
  // Every RUN below an ARG, or an ENV, carries its value in its cache key.
  const lastRun = lines.findLastIndex((l, i) => i > runtime && /^RUN\b/.test(l))
  const meta = lines
    .map((l, i) => ({ i, l }))
    .filter(({ i, l }) => i > runtime && /^(?:ARG|ENV)\s+(?:GIT_SHA|BUILD_TIME)\b/.test(l))
  assert.ok(runtime !== -1 && lastRun !== -1, 'markers')
  assert.equal(meta.length, 4, 'the runtime stage declares ARG and ENV GIT_SHA and BUILD_TIME')
  for (const { i, l } of meta) assert.ok(i > lastRun, `Dockerfile:${i + 1} \`${l}\` is above a RUN`)
})

test('compose-smoke clears an ambient licence before the first compose call (review m89)', () => {
  const src = read('scripts/compose-smoke.sh')
  const unset = /^unset OPENSTEWARD_LICENSE OPENSTEWARD_LICENSE_FILE\b/m.exec(src)
  assert.ok(unset, 'compose-smoke.sh unsets OPENSTEWARD_LICENSE and OPENSTEWARD_LICENSE_FILE')
  const firstCompose = src.search(/^dc\(\) \{/m)
  assert.ok(firstCompose !== -1 && unset.index < firstCompose, 'before dc() is defined')
})

test('the compose-smoke scope runs on a change to either licensing package (review m91)', () => {
  const testYml = load(read('.github/workflows/test.yml')) as { jobs: Record<string, Job> }
  const scope = Object.values(testYml.jobs)
    .flatMap((j) => j.steps ?? [])
    .find((s) => s.id === 'scope')
  const pattern = /grep -qE '([^']+)'/.exec(scope?.run ?? '')?.[1]
  assert.ok(pattern, "test.yml's compose-smoke scope step greps a pattern (parser guard)")
  const re = new RegExp(pattern)
  for (const path of [
    'packages/shared/src/licensing/manager.ts',
    'packages/license-token/src/verify.ts',
    'scripts/image-license-probe.cjs',
    'scripts/check-license-keys.ts',
    'Dockerfile',
  ])
    assert.match(path, re, path)
  assert.doesNotMatch('apps/integration-server/src/server.ts', re, 'the accepted gap stays a gap')
})
