#!/usr/bin/env tsx
/**
 * Release script — bumps version, regenerates docs, commits, and creates a scoped git tag.
 *
 * Usage:
 *   pnpm run release integration-server patch   # 1.0.0 → 1.0.1 — also regenerates docs/openapi/openapi.json
 *   pnpm run release integration-server minor   # 1.0.0 → 1.1.0
 *   pnpm run release integration-server major   # 1.0.0 → 2.0.0
 *   pnpm run release admin patch
 *   pnpm run release admin-api patch
 *   pnpm run release docs-server patch
 *   pnpm run release webhook-gateway patch
 *   pnpm run release shared major               # 0.1.0 → 1.0.0 (@opensteward/shared)
 *   pnpm run release design-system patch
 *   pnpm run release codegen patch
 *
 * Does NOT auto-push. Review the commit and tag, then push manually:
 *   git push origin main <scope>/v<version>
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const SCOPES: Record<string, string> = {
  'integration-server': 'apps/integration-server',
  admin: 'apps/admin',
  'admin-api': 'apps/admin-api',
  'docs-server': 'apps/docs-server',
  'webhook-gateway': 'apps/webhook-gateway',
  shared: 'packages/shared',
  'design-system': 'packages/design-system',
  codegen: 'packages/codegen',
  // Coordinated all-services release. Tracks the repo-level `VERSION` file (not
  // a package.json) — this is the single version the Helm chart pins and the
  // tag (`platform/vX.Y.Z`) that builds + publishes all five container images.
  platform: '.',
}

// Scopes that own generated docs — releasing them runs `pnpm run docs:all`
// so the spec's `info.version` field tracks the new package version.
const DOCS_SCOPES = new Set(['integration-server'])

/**
 * Scopes whose tag builds a container image (images.yml builds `platform/v*`
 * and every `<service>/v*`), plus `shared`, which ships the licensing module.
 * None may be tagged while a trusted licence key is a placeholder, the signed
 * revocation list is missing, invalid or older than the last release's, or a
 * licence bypass exists (Handover A §6, §8 A3). images.yml's prepare job runs
 * the same two commands, because a tag pushed by hand never passes through
 * here. Both name the root package.json scripts, so the gate is spelled once.
 */
export const LICENSE_GATED_SCOPES: ReadonlySet<string> = new Set([
  'platform',
  'integration-server',
  'admin',
  'admin-api',
  'docs-server',
  'webhook-gateway',
  'shared',
])
export const LICENSE_GATE_COMMANDS = [
  'pnpm run check:license-keys:release',
  'pnpm run check:no-license-bypass',
] as const

/** 'An admin release', 'A shared release'. */
const aOrAn = (word: string): string => (/^[aeiou]/i.test(word) ? 'An' : 'A')

export function assertLicenseReleasable(
  scope: string,
  io: { exec: (cmd: string) => void; exit: (code: number) => never } = {
    exec: (cmd) => {
      execSync(cmd, { stdio: 'inherit' })
    },
    exit: (code) => process.exit(code),
  },
): void {
  if (!LICENSE_GATED_SCOPES.has(scope)) return
  for (const cmd of LICENSE_GATE_COMMANDS) {
    try {
      io.exec(cmd)
    } catch {
      console.error(
        `\nError: the license release gate failed (${cmd}).\n` +
          `${aOrAn(scope)} ${scope} release ships the licensing module: it needs the license service's real public keys and ` +
          `a current signed revocation list, never older than the last release's (Task A3.9).\n`,
      )
      io.exit(1)
    }
  }
}

/**
 * The release commit stages with `git add -A`, so a file git neither tracks nor
 * ignores would ship in it, and in the tag: a license.key a run from source
 * reads (docs/deployment/license.md), an AGENTS.md a tool wrote. `git diff
 * --quiet HEAD` never sees such a file, so this lists them. It only reads.
 */
export function assertNoUntrackedFiles(
  io: { read: (cmd: string) => string; exit: (code: number) => never } = {
    read: run,
    exit: (code) => process.exit(code),
  },
): void {
  const untracked = io
    .read('git status --porcelain=v1 --untracked-files=all')
    .split('\n')
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3))
  if (untracked.length === 0) return
  console.error(
    'Error: these files are not tracked, and the release commit (git add -A) would include them:\n' +
      untracked.map((f) => `  ${f}\n`).join('') +
      'Commit, remove or ignore them first.',
  )
  io.exit(1)
}

const BUMP_TYPES = ['major', 'minor', 'patch'] as const
type BumpType = (typeof BUMP_TYPES)[number]

function bumpVersion(version: string, bump: BumpType): string {
  const [major, minor, patch] = version.split('.').map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

/**
 * Bail loudly if CHANGELOG.md has no `## [v<version>]` heading.
 * Operators rely on this file to decide whether to take an upgrade;
 * tagging a release without first writing a release note is the
 * single biggest "what changed?" footgun this gate exists to
 * close.
 *
 * Matches:
 *   - `## [v1.4.1]`
 *   - `## [v1.4.1] — 2026-05-27`
 *   - `## v1.4.1`
 *   - `## [1.4.1]` (operators sometimes drop the leading `v`)
 */
function assertChangelogEntry(newVersion: string): void {
  const changelogPath = resolve(process.cwd(), 'CHANGELOG.md')
  let body: string
  try {
    body = readFileSync(changelogPath, 'utf8')
  } catch {
    console.error(
      `Error: CHANGELOG.md not found at ${changelogPath}.\n` +
        `Every release needs an entry — see docs/deployment/upgrading.md.`,
    )
    process.exit(1)
  }
  // Look for a level-2 header containing the version. `\b` doesn't work
  // around `.` so we use an explicit boundary instead.
  const v = newVersion.replace(/\./g, '\\.')
  const pattern = new RegExp(`^##\\s+\\[?v?${v}\\]?(\\s|$)`, 'm')
  if (!pattern.test(body)) {
    console.error(
      `\nError: CHANGELOG.md has no section for v${newVersion}.\n\n` +
        `Add a header like:\n\n` +
        `    ## [v${newVersion}] — ${new Date().toISOString().slice(0, 10)}\n\n` +
        `    ### Added / Changed / Fixed\n\n` +
        `    - <what changed>\n\n` +
        `…above the existing entries, then re-run \`pnpm release\`.\n` +
        `Operators rely on this file to decide whether to take the upgrade.\n`,
    )
    process.exit(1)
  }
}

function main() {
  const [scope, bump] = process.argv.slice(2)

  if (!scope || !bump) {
    console.error('Usage: pnpm run release <scope> <major|minor|patch>')
    console.error(`Scopes: ${Object.keys(SCOPES).join(', ')}`)
    process.exit(1)
  }

  if (!SCOPES[scope]) {
    console.error(`Unknown scope: "${scope}". Valid: ${Object.keys(SCOPES).join(', ')}`)
    process.exit(1)
  }

  if (!BUMP_TYPES.includes(bump as BumpType)) {
    console.error(`Unknown bump type: "${bump}". Valid: major, minor, patch`)
    process.exit(1)
  }

  const pkgDir = SCOPES[scope]!

  // Check for uncommitted changes
  try {
    run('git diff --quiet HEAD')
  } catch {
    console.error('Error: Working tree has uncommitted changes. Commit or stash first.')
    process.exit(1)
  }
  assertNoUntrackedFiles()

  // Read current version. The `platform` scope tracks the repo-level VERSION
  // file (the coordinated all-services version the Helm chart pins); every
  // other scope tracks its package.json.
  const isPlatform = scope === 'platform'
  const versionPath = isPlatform ? resolve('VERSION') : resolve(pkgDir, 'package.json')
  const currentVersion = isPlatform
    ? readFileSync(versionPath, 'utf8').trim()
    : (JSON.parse(readFileSync(versionPath, 'utf8')).version as string)
  const newVersion = bumpVersion(currentVersion, bump as BumpType)

  console.log(`\n${scope}: ${currentVersion} → ${newVersion}\n`)

  // CHANGELOG gate. The plan: every release must have a section in
  // CHANGELOG.md headed `## [v<newVersion>]` BEFORE the tag goes out,
  // so operators can read what changed before pulling. The matcher
  // accepts an optional date suffix (`## [v1.4.1] — 2026-05-27`) and
  // a few formatting variants (square brackets optional, `v` optional)
  // — the goal is to catch the common "I forgot to add an entry" case,
  // not be a lexer.
  assertChangelogEntry(newVersion)

  // License gate (Task A3.7): after the CHANGELOG gate, before anything is written.
  assertLicenseReleasable(scope)

  // Write the new version back.
  if (isPlatform) {
    writeFileSync(versionPath, newVersion + '\n')
    console.log(`✓ Updated VERSION → ${newVersion}`)
  } else {
    const pkgJson = JSON.parse(readFileSync(versionPath, 'utf8'))
    pkgJson.version = newVersion
    writeFileSync(versionPath, JSON.stringify(pkgJson, null, 2) + '\n')
    console.log(`✓ Updated ${pkgDir}/package.json`)
  }

  // Regenerate generated docs for scopes that own them.
  if (DOCS_SCOPES.has(scope)) {
    try {
      console.log('  Regenerating docs...')
      execSync('pnpm run docs:all', { stdio: 'inherit' })
      console.log(`✓ Docs regenerated with version ${newVersion}`)
    } catch {
      console.warn('⚠ docs:all failed — spec version may be stale')
    }
  }

  // Stage and commit
  execSync('git add -A', { stdio: 'inherit' })
  const commitMsg = `chore(${scope}): release v${newVersion}`
  execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' })
  console.log(`✓ Committed: ${commitMsg}`)

  // Create scoped tag
  const tag = `${scope}/v${newVersion}`
  execSync(`git tag ${tag}`, { stdio: 'inherit' })
  console.log(`✓ Tag created: ${tag}`)

  console.log(`\nDone. To push:\n  git push origin main ${tag}\n`)
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
