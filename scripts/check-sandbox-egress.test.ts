/**
 * The egress guard's own tests.
 *
 * A guard that cannot fail is worse than no guard — it reports success forever
 * and nobody looks again. These drive the real repository rather than fixtures,
 * so the check is exercised against the code it actually protects.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSandboxEgress } from './check-sandbox-egress'
import { checkSandboxCoverage } from './check-sandbox-coverage'

test('the sandbox subtree is clean today', () => {
  assert.deepEqual(findSandboxEgress(), [])
})

test('every method a manifest names exists on its interface', () => {
  const broken = checkSandboxCoverage().filter((r) => r.unknown.length > 0)
  assert.deepEqual(
    broken.map((r) => `${r.vertical}: ${r.unknown.join(', ')}`),
    [],
  )
})

test('a vertical with a manifest covers at least one method', () => {
  // Guards against a manifest that parses but names nothing — which would read
  // as "clean" on both checks while covering no routes at all.
  for (const report of checkSandboxCoverage()) {
    if (!report.hasManifest) continue
    assert.ok(report.covered > 0, `${report.vertical} has a manifest but covers no methods`)
  }
})
