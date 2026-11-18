/**
 * Tests for the Fastify-logger guard.
 *
 * Pins the exact regression it exists to stop: an app building its own Fastify
 * instance with `logger: true`, which silently opts out of LOG_REDACT_PATHS.
 *
 * Run: `pnpm exec tsx --test scripts/check-server-logging.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findLoggerViolations } from './check-server-logging.ts'

test('flags a bare logger: true', () => {
  const source = `const fastify = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 })`
  const violations = findLoggerViolations('apps/admin/src/core/server.ts', source)
  assert.equal(violations.length, 1)
  assert.equal(violations[0]?.line, 1)
})

test('accepts a logger built by the shared helper', () => {
  const source = `const fastify = Fastify({ logger: buildLoggerConfig(true), bodyLimit: 1 })`
  assert.deepEqual(findLoggerViolations('apps/admin/src/core/server.ts', source), [])
})

test('accepts a multi-line options literal', () => {
  const source = [
    'const fastify = Fastify({',
    '  logger: buildLoggerConfig(config?.logger),',
    '  bodyLimit: 1_048_576,',
    '  trustProxy: false,',
    '})',
  ].join('\n')
  assert.deepEqual(findLoggerViolations('apps/x/src/server.ts', source), [])
})

test('reports the right line for a violation further down a file', () => {
  const source = [
    'import Fastify from "fastify"',
    '',
    '',
    'const f = Fastify({ logger: true })',
  ].join('\n')
  const violations = findLoggerViolations('apps/x/src/server.ts', source)
  assert.equal(violations.length, 1)
  assert.equal(violations[0]?.line, 4)
})

test('flags each offending instance when a file builds several', () => {
  const source = [
    'const a = Fastify({ logger: buildLoggerConfig(true) })',
    'const b = Fastify({ logger: true })',
    'const c = Fastify({ logger: { level: "debug" } })',
  ].join('\n')
  assert.equal(findLoggerViolations('apps/x/src/server.ts', source).length, 2)
})
