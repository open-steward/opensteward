/**
 * Unit tests for the money-scaling guard, so it cannot quietly stop detecting
 * what it was written for — the same reason the other guard scripts carry
 * their own tests.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findMoneyScaling, identity, untransformRanges } from './check-money-scaling.ts'

test('untransformRanges brace-matches a body containing object literals', () => {
  const src = [
    'export function untransformInvoice(data: Invoice) {',
    '  return {',
    '    lines: data.lineItems.map((li) => ({ amount: li.totalAmount })),',
    '  }',
    '}',
    'export function somethingElse() {',
    '  return 1',
    '}',
  ].join('\n')
  const ranges = untransformRanges(src)
  assert.equal(ranges.length, 1)
  const [[start, end]] = ranges as [[number, number]]
  // Must span the whole body, not stop at the first inner `}`.
  assert.equal(start, 1)
  assert.equal(end, 5)
})

test('it finds a real repo hit and attributes write paths', () => {
  const hits = findMoneyScaling()
  assert.ok(hits.length > 0, 'expected hits on this repo')
  assert.ok(
    hits.some((h) => h.write),
    'expected at least one hit inside an untransform body',
  )
  for (const h of hits) {
    assert.ok(h.line > 0)
    assert.match(identity(h), /^[\w./@-]+:\d+$/)
  }
})

test('it ignores comments and the currency-aware helpers', () => {
  // A guard that flagged its own remedy would be unusable.
  const hits = findMoneyScaling()
  for (const h of hits) {
    assert.ok(
      !/majorToMinor|minorToMajor|minorUnitExponent/.test(h.text),
      `flagged a line already using the helper: ${identity(h)}`,
    )
    assert.ok(!h.text.startsWith('//'), `flagged a comment: ${identity(h)}`)
    assert.ok(!h.text.startsWith('*'), `flagged a docblock line: ${identity(h)}`)
  }
})

test('the baseline is exactly the current hits, so a new one fails', () => {
  const baseline: string[] = JSON.parse(
    readFileSync(join(import.meta.dirname, 'money-scaling-baseline.json'), 'utf8'),
  )
  const ids = findMoneyScaling().map(identity).sort()
  assert.deepEqual(baseline, ids)
})
