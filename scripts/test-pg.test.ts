/**
 * scripts/test-pg.sh, driven through a stub `docker` on PATH that records
 * every call: the container leaves nothing behind (data on tmpfs, removed
 * with -v, on success and on failure), and TEST_PG_URL refuses a database
 * that looks like a real OpenSteward one before anything runs.
 *
 * TEST_PG_DRY_RUN=1 makes the script print the test commands instead of
 * running them, so no suite runs here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dirname, 'test-pg.sh')

function withStubDocker(ready: boolean): { bin: string; log: string; cleanup(): void } {
  const bin = mkdtempSync(join(tmpdir(), 'test-pg-stub-'))
  const log = join(bin, 'docker.log')
  writeFileSync(
    join(bin, 'docker'),
    [
      '#!/bin/sh',
      `echo "$*" >> "${log}"`,
      'case "$1" in',
      '  run) echo 0123456789abcdef ;;',
      '  port) echo 127.0.0.1:55432 ;;',
      `  exec) exit ${ready ? 0 : 1} ;;`,
      'esac',
      'exit 0',
    ].join('\n') + '\n',
  )
  chmodSync(join(bin, 'docker'), 0o755)
  return { bin, log, cleanup: () => rmSync(bin, { recursive: true, force: true }) }
}

function run(env: Record<string, string>, args: string[] = []) {
  return spawnSync('bash', [SCRIPT, ...args], {
    env: { ...process.env, TEST_PG_URL: '', TEST_PG_KEEP: '', ...env },
    encoding: 'utf8',
  })
}

test('the container keeps its data on tmpfs and is removed with its volumes', () => {
  const stub = withStubDocker(true)
  try {
    const r = run({ PATH: `${stub.bin}:${process.env.PATH}`, TEST_PG_DRY_RUN: '1' })
    assert.equal(r.status, 0, r.stderr)
    const calls = readFileSync(stub.log, 'utf8').split('\n')
    const started = calls.find((c) => c.startsWith('run '))!
    assert.match(started, /--tmpfs \/var\/lib\/postgresql\/data/)
    assert.match(started, /--rm/)
    assert.match(started, /-p 127\.0\.0\.1::5432/)
    assert.ok(
      calls.some((c) => /^rm -f -v opensteward-test-pg-/.test(c)),
      'removed with rm -f -v',
    )
  } finally {
    stub.cleanup()
  }
})

test('the container is removed with its volumes when Postgres never becomes ready', () => {
  const stub = withStubDocker(false)
  try {
    const r = run({
      PATH: `${stub.bin}:${process.env.PATH}`,
      TEST_PG_DRY_RUN: '1',
      TEST_PG_READY_TIMEOUT: '1',
    })
    assert.notEqual(r.status, 0)
    const calls = readFileSync(stub.log, 'utf8')
    assert.match(calls, /^rm -f -v opensteward-test-pg-/m)
  } finally {
    stub.cleanup()
  }
})

test('TEST_PG_URL refuses a database named opensteward, before running anything', () => {
  const stub = withStubDocker(true)
  try {
    const r = run({
      PATH: `${stub.bin}:${process.env.PATH}`,
      TEST_PG_URL: 'postgres://u:p@127.0.0.1:1/opensteward',
      TEST_PG_DRY_RUN: '1',
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /refusing/i)
    assert.match(r.stderr, /TEST_PG_FORCE=1/)
    assert.doesNotMatch(r.stdout + r.stderr, /u:p@/)
    assert.equal(existsSync(stub.log), false, 'docker was never called')
    assert.doesNotMatch(r.stdout, /turbo run test/)
  } finally {
    stub.cleanup()
  }
})

test('TEST_PG_FORCE=1 lets a TEST_PG_URL through without inspecting it', () => {
  const r = run({
    TEST_PG_URL: 'postgres://u:p@127.0.0.1:1/opensteward',
    TEST_PG_FORCE: '1',
    TEST_PG_DRY_RUN: '1',
  })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /turbo run test/)
})
