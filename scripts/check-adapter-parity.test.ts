/**
 * Tests for the adapter-parity guard's `unsupported` allowance (Task A2 of
 * the unsupported-platform-status plan).
 *
 * Pins: a metadata slug marked `unsupported: { reason, issueUrl? }` may have
 * no factory (same treatment as the pre-existing `KNOWN_GAPS` allowlist) —
 * because enabling it is refused server-side before the registry is ever
 * consulted, so the "unknown adapter slug" throw this guard exists to catch
 * cannot happen for it. An UNMARKED slug with no factory must still fail:
 * the allowance is scoped to `unsupported`, not a general amnesty.
 *
 * Also pins the regex-based `unsupported: {...}` detection at both metadata
 * layouts (multi-line, one-field-per-line; and single-line) and confirms a
 * nested `unsupported` object is correctly scoped to the ONE entry that owns
 * it — not leaking backward onto the previous entry or forward onto the
 * next, which is the failure mode a naive "does this file contain
 * `unsupported:` anywhere" check would have.
 *
 * Run: `pnpm exec tsx --test scripts/check-adapter-parity.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMetadataEntries,
  diffParity,
  KNOWN_GAPS,
  type MetadataEntry,
} from './check-adapter-parity.ts'

// ── parseMetadataEntries ─────────────────────────────────────────────────

const MULTI_LINE = `export const PLATFORMS: ReadonlyArray<PlatformMetadata> = [
  {
    slug: 'fortnox',
    name: 'Fortnox',
    auth_type: 'oauth2',
    recommendedScopes: ['invoice.read', 'invoice.write'],
  },
  {
    slug: 'acme-erp',
    name: 'Acme ERP',
    auth_type: 'oauth2',
    unsupported: {
      reason:
        "OAuth client must be registered inside each customer's own instance; not supported yet.",
      issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
    },
  },
  {
    slug: 'xero',
    name: 'Xero',
    auth_type: 'oauth2',
  },
] as const
`

const SINGLE_LINE = `export const PLATFORMS: ReadonlyArray<PlatformMetadata> = [
  { slug: 'fedex', name: 'FedEx', auth_type: 'oauth2' },
  { slug: 'blocked-carrier', name: 'Blocked Carrier', auth_type: 'api_key', unsupported: { reason: 'No public API.' } },
  { slug: 'ups', name: 'UPS', auth_type: 'oauth2' },
]
`

test('parseMetadataEntries: multi-line layout finds every slug in order', () => {
  const entries = parseMetadataEntries(MULTI_LINE)
  assert.deepEqual(
    entries.map((e) => e.slug),
    ['fortnox', 'acme-erp', 'xero'],
  )
})

test('parseMetadataEntries: multi-line `unsupported: {` scopes to its own entry only', () => {
  const entries = parseMetadataEntries(MULTI_LINE)
  const bySlug = new Map(entries.map((e) => [e.slug, e]))
  assert.equal(bySlug.get('fortnox')!.unsupported, false)
  assert.equal(bySlug.get('acme-erp')!.unsupported, true)
  // The entry AFTER the unsupported one must not inherit it — this is the
  // failure mode a "does `unsupported:` appear anywhere after this slug"
  // check (rather than bounding the slice at the NEXT slug) would produce.
  assert.equal(bySlug.get('xero')!.unsupported, false)
})

test('parseMetadataEntries: single-line layout also finds and scopes unsupported', () => {
  const entries = parseMetadataEntries(SINGLE_LINE)
  const bySlug = new Map(entries.map((e) => [e.slug, e]))
  assert.equal(bySlug.get('fedex')!.unsupported, false)
  assert.equal(bySlug.get('blocked-carrier')!.unsupported, true)
  assert.equal(bySlug.get('ups')!.unsupported, false)
})

test('parseMetadataEntries: a nested array/object field with no `unsupported` key is not mistaken for one', () => {
  const src = `[
    { slug: 'a', recommendedScopes: ['read', 'write'] },
    { slug: 'b', recommendedScopes: ['read'] },
  ]`
  const entries = parseMetadataEntries(src)
  assert.deepEqual(
    entries.map((e) => e.unsupported),
    [false, false],
  )
})

// ── diffParity ────────────────────────────────────────────────────────────

function entry(slug: string, unsupported = false): MetadataEntry {
  return { slug, unsupported }
}

test('diffParity: an unmarked slug with no factory is a missing-factory error', () => {
  const { errors } = diffParity('accounting', [entry('unbuilt-platform')], new Set(), new Set())
  assert.deepEqual(errors, [
    { vertical: 'accounting', slug: 'unbuilt-platform', kind: 'missing-factory' },
  ])
})

test('diffParity: an `unsupported` slug with no factory passes (no error)', () => {
  const { errors } = diffParity('accounting', [entry('acme-erp', true)], new Set(), new Set())
  assert.deepEqual(errors, [])
})

test('diffParity: unsupported does not mask an UNRELATED unmarked slug in the same vertical', () => {
  const { errors } = diffParity(
    'accounting',
    [entry('acme-erp', true), entry('unbuilt-platform', false)],
    new Set(),
    new Set(),
  )
  assert.deepEqual(errors, [
    { vertical: 'accounting', slug: 'unbuilt-platform', kind: 'missing-factory' },
  ])
})

test('diffParity: a slug with a factory never errors, marked or not', () => {
  const { errors } = diffParity(
    'accounting',
    [entry('fortnox', false), entry('acme-erp', true)],
    new Set(['fortnox', 'acme-erp']),
    new Set(),
  )
  assert.deepEqual(errors, [])
})

test('diffParity: the pre-existing KNOWN_GAPS allowance is untouched by the unsupported check', () => {
  const gaps = new Set(['accounting/legacy-gap'])
  const { errors } = diffParity('accounting', [entry('legacy-gap', false)], new Set(), gaps)
  assert.deepEqual(errors, [])
})

test('diffParity: a real KNOWN_GAPS entry from the live allowlist still passes with no factory', () => {
  const [gap] = [...KNOWN_GAPS][0]!.split('/').slice(-1)
  const vertical = [...KNOWN_GAPS][0]!.split('/')[0]!
  const { errors } = diffParity(vertical, [entry(gap, false)], new Set())
  assert.deepEqual(errors, [])
})

test('diffParity: a factory with no metadata entry is an orphan-factory warning, unaffected by unsupported', () => {
  const { warnings } = diffParity(
    'accounting',
    [entry('fortnox', false)],
    new Set(['fortnox', 'ghost-factory']),
  )
  assert.deepEqual(warnings, [
    { vertical: 'accounting', slug: 'ghost-factory', kind: 'orphan-factory' },
  ])
})
