/**
 * Tests for the published-packages guard: no workspace dependency, the right
 * license, and publish-npm.yml publishing and building exactly the guarded set.
 *
 * Run: `pnpm exec tsx --test scripts/check-published-packages.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildFilters,
  checkPublishedPackages,
  findInternalDeps,
  PUBLISHED_PACKAGES,
  publishedDirs,
  workspaceGlobs,
} from './check-published-packages.ts'

/** The two publish-npm.yml steps the guard reads, in the shape A1.7 writes them. */
const workflow = (filters: string, dirs: string) =>
  [
    '      - name: Build packages',
    `        run: pnpm ${filters} run build`,
    '',
    '      - name: Publish (or dry-run)',
    '        run: |',
    `          for dir in ${dirs}; do`,
    '            echo "$dir"',
    '          done',
    '',
  ].join('\n')

const ONE = { '@x/a': { dir: 'packages/a', license: 'Apache-2.0' } } as const

function repo(manifest: Record<string, unknown>, wf: string): string {
  const root = mkdtempSync(join(tmpdir(), 'published-packages-'))
  mkdirSync(join(root, 'packages/a'), { recursive: true })
  writeFileSync(join(root, 'packages/a/package.json'), JSON.stringify(manifest))
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  writeFileSync(join(root, '.github/workflows/publish-npm.yml'), wf)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  return root
}
const CLEAN = { name: '@x/a', license: 'Apache-2.0', dependencies: { zod: '^4.6.5' } }
const CLEAN_WF = workflow('--filter @x/a', 'packages/a')

test('flags workspace: specs', () => {
  const deps = { zod: '^4.6.5', '@opensteward/shared': 'workspace:*' }
  assert.deepEqual(
    findInternalDeps('x', { dependencies: deps }).map((v) => v.dep),
    ['@opensteward/shared'],
  )
})

test('flags @opensteward deps at registry versions, the look-alike scope, and devDependencies', () => {
  assert.equal(
    findInternalDeps('x', { peerDependencies: { '@opensteward/license-token': '^1.0.0' } }).length,
    1,
  )
  assert.equal(findInternalDeps('x', { dependencies: { '@open-steward/sdk': '1.0.0' } }).length, 1)
  assert.equal(
    findInternalDeps('x', { devDependencies: { '@opensteward/shared': 'workspace:^' } }).length,
    1,
  )
  assert.equal(findInternalDeps('x', { optionalDependencies: { local: 'workspace:*' } }).length, 1)
})

test('flags a workspace package reached under another name or by path', () => {
  const deps = {
    shared: 'npm:@opensteward/shared@^1.0.0',
    sdk: 'npm:@open-steward/sdk@1.0.0',
    viaFile: 'file:../../packages/shared',
    viaLink: 'link:../../packages/shared',
    viaPortal: 'portal:../../packages/shared',
    relative: '../../packages/shared',
    dotted: './vendor/shared',
    absolute: '/opt/opensteward/packages/shared',
    home: '~/opensteward/packages/shared',
    parent: '..', // bare: npm-package-arg reads any spec starting with . as a directory (review r6)
    here: '.',
    hidden: '.vendor/shared',
    backslash: '\\opt\\shared',
    drive: 'C:\\opensteward\\shared',
  }
  assert.deepEqual(
    findInternalDeps('x', { dependencies: deps }).map((v) => v.dep),
    Object.keys(deps),
  )
})

test('passes registry-only deps, including an npm alias to a public package', () => {
  assert.deepEqual(findInternalDeps('x', { dependencies: { axios: '^1.20.0', zod: '^4.6.5' } }), [])
  assert.deepEqual(
    findInternalDeps('x', {
      devDependencies: {
        '@typescript/native': 'npm:typescript@^7.0.2',
        typescript: 'npm:@typescript/typescript6@^6.0.2',
      },
    }),
    [],
  )
})

test('reads the `for dir in …; do` publish loop; the old `for pkg in` form reads as nothing', () => {
  assert.deepEqual(publishedDirs(workflow('', 'apps/mcp-server packages/sdk')), [
    'apps/mcp-server',
    'packages/sdk',
  ])
  assert.deepEqual(publishedDirs('          for pkg in @opensteward/a @opensteward/b; do\n'), [])
})

test('reads the Build packages filters', () => {
  assert.deepEqual(buildFilters(workflow('--filter @x/a --filter @x/b', 'packages/a')), [
    '@x/a',
    '@x/b',
  ])
})

test('a clean fixture repo passes', () => {
  const root = repo(CLEAN, CLEAN_WF)
  try {
    assert.deepEqual(checkPublishedPackages(root, ONE), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('each drift is one problem: license, name, a workspace dep, the loop, the build filters', () => {
  const cases: Array<[Record<string, unknown>, string, RegExp]> = [
    [{ ...CLEAN, license: 'MIT' }, CLEAN_WF, /license is "MIT", expected Apache-2\.0/],
    [{ ...CLEAN, name: '@x/b' }, CLEAN_WF, /name is "@x\/b"/],
    [
      { ...CLEAN, dependencies: { '@opensteward/shared': 'workspace:*' } },
      CLEAN_WF,
      /registry cannot resolve/,
    ],
    [CLEAN, workflow('--filter @x/a', 'packages/a packages/b'), /publish loop/],
    [CLEAN, workflow('', 'packages/a'), /Build packages/],
  ]
  for (const [manifest, wf, expected] of cases) {
    const root = repo(manifest, wf)
    try {
      const problems = checkPublishedPackages(root, ONE)
      assert.equal(problems.length, 1, problems.join('\n'))
      assert.match(problems[0]!, expected)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('reads the pnpm-workspace.yaml packages globs, skipping comments and other keys', () => {
  const yaml = [
    '# top-level comment',
    'packages:',
    "  - 'apps/*'",
    '  - "packages/*"',
    '  # a comment inside the list',
    '  - e2e',
    'onlyBuiltDependencies:',
    '  - esbuild',
    '',
  ].join('\n')
  assert.deepEqual(workspaceGlobs(yaml), ['apps/*', 'packages/*', 'e2e'])
})

test('every workspace package outside the published set must be private', () => {
  const withB = (b: Record<string, unknown> | string, workspace?: string) => {
    const root = repo(CLEAN, CLEAN_WF)
    mkdirSync(join(root, 'packages/b'))
    writeFileSync(
      join(root, 'packages/b/package.json'),
      typeof b === 'string' ? b : JSON.stringify(b),
    )
    if (workspace !== undefined) writeFileSync(join(root, 'pnpm-workspace.yaml'), workspace)
    return root
  }
  const cases: Array<[Record<string, unknown> | string, string | undefined, RegExp | null]> = [
    [{ name: '@x/b' }, undefined, /packages\/b\/package\.json: @x\/b is not a published package/],
    [{ name: '@x/b', private: false }, undefined, /@x\/b is not a published package/],
    [{ name: '@x/b', private: true }, undefined, null],
    ['{ not json', undefined, /packages\/b\/package\.json: cannot read it/],
    // A plain-directory entry is checked too, not only `dir/*` globs.
    [
      { name: '@x/b' },
      "packages:\n  - 'packages/a'\n  - 'packages/b'\n",
      /@x\/b is not a published/,
    ],
    // A glob form the guard cannot expand is a problem, never a silent skip.
    [{ name: '@x/b', private: true }, "packages:\n  - 'packages/**'\n", /cannot expand the glob/],
  ]
  for (const [b, workspace, expected] of cases) {
    const root = withB(b, workspace)
    try {
      const problems = checkPublishedPackages(root, ONE)
      if (expected === null) assert.deepEqual(problems, [])
      else {
        assert.equal(problems.length, 1, problems.join('\n'))
        assert.match(problems[0]!, expected)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('a missing pnpm-workspace.yaml is a problem', () => {
  const root = repo(CLEAN, CLEAN_WF)
  try {
    rmSync(join(root, 'pnpm-workspace.yaml'))
    assert.deepEqual(checkPublishedPackages(root, ONE), ['pnpm-workspace.yaml: cannot read it'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the guarded set and its licenses (D-C)', () => {
  assert.deepEqual(PUBLISHED_PACKAGES, {
    '@opensteward/mcp-server': { dir: 'apps/mcp-server', license: 'Apache-2.0' },
    '@opensteward/sdk': { dir: 'packages/sdk', license: 'Apache-2.0' },
    '@opensteward/license-token': { dir: 'packages/license-token', license: 'Elastic-2.0' },
  })
})

test('this repository is clean', () => {
  assert.deepEqual(checkPublishedPackages(), [])
})

// main() is what CI runs. The tests above call checkPublishedPackages directly,
// so they stay green when main() stops failing on what it reports. This runs a
// copy of the script over a fixture repository: the script reads the tree its
// own directory hangs off.
test('the CLI fails on a problem, and --soft only reports it', () => {
  // A real path: on macOS tmpdir() is a symlink, and the script only runs as
  // main when its own path matches argv[1].
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'published-packages-cli-')))
  const script = join(root, 'scripts', 'check-published-packages.ts')
  const cli = (args: string[] = []) => {
    const res = spawnSync(
      join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx'),
      [script, ...args],
      { cwd: root, encoding: 'utf8', timeout: 60_000 },
    )
    const out = `${res.stdout}\n${res.stderr}`
    assert.equal(res.error, undefined, out)
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, out }
  }
  const manifest = (name: string, extra: Record<string, unknown> = {}) => {
    const { dir, license } = PUBLISHED_PACKAGES[name]!
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name, license, ...extra }))
  }
  try {
    mkdirSync(join(root, 'scripts'))
    copyFileSync(join(import.meta.dirname, 'check-published-packages.ts'), script)
    for (const name of Object.keys(PUBLISHED_PACKAGES)) manifest(name)
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n")
    mkdirSync(join(root, '.github/workflows'), { recursive: true })
    writeFileSync(
      join(root, '.github/workflows/publish-npm.yml'),
      workflow(
        Object.keys(PUBLISHED_PACKAGES)
          .map((n) => `--filter ${n}`)
          .join(' '),
        Object.values(PUBLISHED_PACKAGES)
          .map((p) => p.dir)
          .join(' '),
      ),
    )
    const clean = cli()
    assert.equal(clean.status, 0, clean.out)
    assert.match(clean.stdout, /✓ \d+ published packages/, clean.out)

    manifest('@opensteward/sdk', { dependencies: { '@opensteward/shared': 'workspace:*' } })
    const hard = cli()
    assert.equal(hard.status, 1, hard.out)
    assert.match(hard.stderr, /@opensteward\/sdk: dependencies has @opensteward\/shared/, hard.out)
    assert.doesNotMatch(hard.stdout, /✓/, hard.out)

    const soft = cli(['--soft'])
    assert.equal(soft.status, 0, soft.out)
    assert.match(soft.stderr, /@opensteward\/sdk: dependencies has @opensteward\/shared/, soft.out)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
