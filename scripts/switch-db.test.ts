/**
 * scripts/switch-db.sh against a stub `docker` that records every call and
 * plays a compose stack: nothing real is started, stopped or copied.
 *
 * What is pinned: nothing is stopped before the operator confirms (so a
 * cancel or a missing terminal leaves the stack as it was); a database with
 * nothing to copy stops the switch unless --skip-missing; the backup directory
 * and dump are owner-only; SQLite paths come from the services' config files;
 * a failure after the stop brings the previous mode back; and the Postgres
 * password never reaches the output.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dirname, 'switch-db.sh')

const STUB = `#!/bin/sh
echo "$*" >> "$STUB_LOG"
case "$*" in
  "ps -a --filter label=com.docker.compose.project="*"--filter label=com.docker.compose.service=admin-api"*)
    [ -n "$STUB_PREV" ] && echo adminid ;;
  "ps --filter label=com.docker.compose.project="*"status=running"*)
    printf '%b' "$STUB_RUNNING" ;;
  "ps -a --filter label=com.docker.compose.project="*)
    printf '%b' "$STUB_EXISTING" ;;
  "inspect "*)
    [ "$STUB_PREV" = postgres ] && echo set ;;
  compose*" config"*)
    cat <<'YAML'
name: fixture
services:
  admin-api:
    environment:
      DATABASE_URL: postgres://opensteward:secretpw@postgres:5432/opensteward
  integration-server:
    environment:
      DATABASE_URL: postgres://opensteward:secretpw@postgres:5432/opensteward
  webhook-gateway:
    depends_on:
      integration-server:
        condition: service_healthy
YAML
    ;;
  compose*" run "*"--list"*) exit 0 ;;
  compose*" run "*)
    db=$(echo "$*" | sed -n 's/.*--db \\([a-z]*\\).*/\\1/p')
    case "$*" in
      *--dry-run*) eval "code=\\\${STUB_DRY_EXIT_$db:-0}" ;;
      *) eval "code=\\\${STUB_EXIT_$db:-0}" ;;
    esac
    echo "stub db-copy $db"
    exit "$code" ;;
  compose*" exec "*pg_dump*) echo PGDUMP ;;
esac
exit 0
`

interface Fixture {
  root: string
  log: string
  env: NodeJS.ProcessEnv
  cleanup(): void
}

function fixture(stubEnv: Record<string, string> = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'switch-db-'))
  mkdirSync(join(root, 'scripts'))
  copyFileSync(SCRIPT, join(root, 'scripts', 'switch-db.sh'))
  writeFileSync(join(root, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(root, 'docker-compose.analytics.example.yml'), 'services: {}\n')
  for (const [dir, body] of [
    [
      'apps/admin-api/config/config.yml',
      'server:\n  port: 3001\ndb:\n  path: ./data/custom-admin.db   # moved\n',
    ],
    ['apps/integration-server/config/config.example.yml', "storePath: './data/creds.db'\n"],
    ['apps/webhook-gateway/config/config.yml', 'db:\n  path: ./data/wh.db\n'],
  ] as const) {
    mkdirSync(join(root, dir, '..'), { recursive: true })
    writeFileSync(join(root, dir), body)
  }
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), STUB)
  chmodSync(join(bin, 'docker'), 0o755)
  const log = join(root, 'docker.log')
  writeFileSync(log, '')
  return {
    root,
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      STUB_LOG: log,
      COMPOSE_PROJECT_NAME: 'fixture',
      SWITCH_DB_BACKUP_DIR: join(root, 'backups'),
      STUB_PREV: 'sqlite',
      STUB_EXISTING: 'admin-api\nintegration-server\n',
      STUB_RUNNING: 'admin-api\nintegration-server\n',
      ...stubEnv,
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function run(f: Fixture, args: string[], input = '', env: Record<string, string> = {}) {
  const r = spawnSync('bash', [join(f.root, 'scripts', 'switch-db.sh'), ...args], {
    env: { ...f.env, ...env },
    input,
    encoding: 'utf8',
  })
  const calls = readFileSync(f.log, 'utf8').split('\n').filter(Boolean)
  return { ...r, calls, out: r.stdout + r.stderr }
}

const stackStop = (calls: string[]) => calls.filter((c) => / stop$/.test(c))
const stackUp = (calls: string[]) => calls.filter((c) => / up -d --no-build$/.test(c))

test('--copy without a terminal or --yes refuses before touching anything', () => {
  const f = fixture()
  try {
    const r = run(f, ['postgres', '--copy'])
    assert.equal(r.status, 2, r.out)
    assert.match(r.out, /--yes/)
    assert.deepEqual(
      r.calls.filter((c) => c.startsWith('compose') && !/ config$/.test(c)),
      [],
      'no compose command beyond reading the config',
    )
  } finally {
    f.cleanup()
  }
})

test('cancelling at the prompt changes nothing: the stack was never stopped', () => {
  const f = fixture()
  try {
    const r = run(f, ['postgres', '--copy'], 'no\n', { SWITCH_DB_ASSUME_TTY: '1' })
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /cancelled/)
    assert.deepEqual(stackStop(r.calls), [], 'the stack was not stopped')
    assert.deepEqual(stackUp(r.calls), [], 'nothing was restarted')
    // Postgres was started only for the dry runs, and stopped again.
    const pgUp = r.calls.findIndex((c) => / up -d --no-build --wait postgres$/.test(c))
    const pgStop = r.calls.findIndex((c) => / stop postgres$/.test(c))
    assert.ok(pgUp >= 0 && pgStop > pgUp, 'postgres started for the dry runs and stopped again')
    assert.ok(!r.calls.some((c) => / run /.test(c) && !/--dry-run|--list/.test(c)), 'no real copy')
  } finally {
    f.cleanup()
  }
})

test('a database with nothing to copy stops the switch unless --skip-missing', () => {
  const f = fixture({ STUB_DRY_EXIT_resources: '5' })
  try {
    const refused = run(f, ['postgres', '--copy', '--yes'])
    assert.notEqual(refused.status, 0)
    assert.match(refused.out, /--skip-missing/)
    assert.deepEqual(stackStop(refused.calls), [], 'the stack was not stopped')

    writeFileSync(f.log, '')
    const skipped = run(f, ['postgres', '--copy', '--yes', '--skip-missing'])
    assert.equal(skipped.status, 0, skipped.out)
    assert.match(skipped.out, /skipped.*resources/i)
    const real = skipped.calls.filter((c) => / run /.test(c) && !/--dry-run|--list/.test(c))
    assert.equal(real.length, 2, real.join('\n'))
    assert.ok(real.every((c) => !/--db resources/.test(c)))
  } finally {
    f.cleanup()
  }
})

test('copying to Postgres: owner-only dump, config-file paths, --no-backup, no password', () => {
  const f = fixture()
  try {
    // An existing, too-open backup directory is tightened.
    mkdirSync(join(f.root, 'backups'), { mode: 0o755 })
    chmodSync(join(f.root, 'backups'), 0o755)
    const r = run(f, ['postgres', '--copy', '--yes'])
    assert.equal(r.status, 0, r.out)
    assert.equal(statSync(join(f.root, 'backups')).mode & 0o777, 0o700)
    const dump = r.out.match(/(\/\S+opensteward-postgres-\S+\.dump)/)?.[1]
    assert.ok(dump, r.out)
    assert.equal(statSync(dump).mode & 0o777, 0o600)
    assert.equal(readFileSync(dump, 'utf8').trim(), 'PGDUMP')
    const admin = r.calls.find(
      (c) => / run /.test(c) && /--db admin/.test(c) && !/--dry-run/.test(c),
    )!
    assert.match(admin, /sqlite:\.\/data\/custom-admin\.db/)
    assert.match(admin, /--overwrite --no-backup/)
    const creds = r.calls.find((c) => /--db credentials/.test(c))!
    assert.match(creds, /sqlite:\$\{STORE_PATH:-\.\/data\/creds\.db\}/)
    const res = r.calls.find((c) => /--db resources/.test(c))!
    assert.match(res, /sqlite:\$\{DATA_STORE_PATH:-\.\/data\/resources\.db\}/)
    assert.doesNotMatch(r.out, /secretpw/)
  } finally {
    f.cleanup()
  }
})

test('a new backup directory is created owner-only', () => {
  const f = fixture()
  try {
    const r = run(f, ['postgres', '--copy', '--yes'], '', {
      SWITCH_DB_BACKUP_DIR: join(f.root, 'fresh', 'nested'),
    })
    assert.equal(r.status, 0, r.out)
    assert.equal(statSync(join(f.root, 'fresh', 'nested')).mode & 0o777, 0o700)
  } finally {
    f.cleanup()
  }
})

test('a failure after the stop brings the previous mode back', () => {
  const f = fixture({ STUB_EXIT_credentials: '1' })
  try {
    const r = run(f, ['postgres', '--copy', '--yes'])
    assert.notEqual(r.status, 0)
    const stop = r.calls.findIndex((c) => / stop$/.test(c))
    assert.ok(stop >= 0, 'the stack had been stopped')
    const restart = r.calls.findIndex(
      (c, i) => i > stop && / up -d --no-build$/.test(c) && !/analytics/.test(c),
    )
    assert.ok(restart > stop, `restarted in sqlite mode:\n${r.calls.join('\n')}`)
    assert.match(r.out, /restarted .*sqlite/i)
  } finally {
    f.cleanup()
  }
})

test('a failure partway through a Postgres refresh leaves the stack stopped, with the restore command', () => {
  // Already on Postgres, refreshing it from SQLite: the previous mode IS the
  // partly overwritten target, so restarting it would serve half a copy.
  const f = fixture({
    STUB_PREV: 'postgres',
    STUB_EXISTING: 'admin-api\nintegration-server\npostgres\n',
    STUB_RUNNING: 'admin-api\nintegration-server\npostgres\n',
    STUB_EXIT_credentials: '1',
  })
  try {
    const r = run(f, ['postgres', '--copy', '--yes'])
    assert.notEqual(r.status, 0)
    const stop = r.calls.findIndex((c) => / stop$/.test(c))
    assert.ok(stop >= 0, 'the stack had been stopped')
    assert.deepEqual(
      r.calls.slice(stop).filter((c) => / up -d --no-build$/.test(c)),
      [],
      `not restarted:\n${r.calls.join('\n')}`,
    )
    const dump = r.out.match(/(\/\S+opensteward-postgres-\S+\.dump)/)?.[1]
    assert.ok(dump, r.out)
    assert.ok(r.out.includes(`pg_restore -U opensteward --clean -d opensteward < ${dump}`), r.out)
    assert.match(r.out, /left stopped/i)
    assert.doesNotMatch(r.out, /secretpw/)
  } finally {
    f.cleanup()
  }
})

test('a failure partway through a SQLite refresh leaves the stack stopped, pointing at the snapshots', () => {
  const f = fixture({ STUB_PREV: 'sqlite', STUB_EXIT_credentials: '1' })
  try {
    const r = run(f, ['sqlite', '--copy', '--yes'])
    assert.notEqual(r.status, 0)
    const stop = r.calls.findIndex((c) => / stop$/.test(c))
    assert.ok(stop >= 0)
    assert.deepEqual(
      r.calls.slice(stop).filter((c) => / up -d --no-build$/.test(c)),
      [],
      `not restarted:\n${r.calls.join('\n')}`,
    )
    assert.match(r.out, /left stopped/i)
    assert.match(r.out, /\.pre-copy-<time>\.bak/)
  } finally {
    f.cleanup()
  }
})

test('--keep-backups reaches db-copy for SQLite targets', () => {
  const f = fixture({ STUB_PREV: 'postgres' })
  try {
    const r = run(f, ['sqlite', '--copy', '--yes', '--keep-backups', '5'])
    assert.equal(r.status, 0, r.out)
    const real = r.calls.filter((c) => / run /.test(c) && /--db /.test(c) && !/--dry-run/.test(c))
    assert.equal(real.length, 3)
    assert.ok(
      real.every((c) => /--keep-backups 5/.test(c)),
      real.join('\n'),
    )
    assert.equal(run(f, ['sqlite', '--keep-backups', 'x']).status, 2)
  } finally {
    f.cleanup()
  }
})
