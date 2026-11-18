/**
 * Tests for the pure row-normalisation / markdown-rendering helpers behind
 * `scripts/generate-platforms-doc.ts` (Task A2 of the unsupported-platform-
 * status plan).
 *
 * The generator script itself runs its file-writing `main()` only when
 * invoked directly (`isMain` guard) — importing it here, as this test does,
 * must NOT regenerate `docs/platforms/platforms.md`/`.json` or touch the
 * filesystem at all, so `normalizeRow` and `buildUnsupportedSection` are
 * exported as pure functions that take a plain fixture object.
 *
 * Fixture covers exactly the plan's contract:
 *  - a metadata entry with `unsupported: { reason, issueUrl }` carries that
 *    field into the normalised (and therefore JSON) row;
 *  - `platforms.md`'s "## Unsupported platforms" section lists it with its
 *    reason and a link built from `issueUrl`;
 *  - a supported entry with no `unsupported` field carries no such key at
 *    all (not `undefined` sitting in the object — actually absent, so
 *    `JSON.stringify` omits it);
 *  - with zero unsupported rows, the section is not rendered at all — this
 *    is what keeps `docs/platforms/platforms.md` byte-identical today, since
 *    no real platform is marked unsupported yet.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeRow,
  buildUnsupportedSection,
  buildVerificationSection,
  withReadmeTally,
  type NormalizedRow,
} from '../../scripts/generate-platforms-doc.js'

const SUPPORTED_RAW = {
  slug: 'xero',
  name: 'Xero',
  description: 'Cloud accounting.',
  website: 'https://www.xero.com',
  category: 'accounting',
  auth_type: 'oauth2',
  hq_country: 'NZ',
  docs_url: 'https://developer.xero.com',
  pricing_url: 'https://www.xero.com/pricing',
  founded_year: 2006,
}

const UNSUPPORTED_RAW = {
  slug: 'acme-erp',
  name: 'Acme ERP',
  description: 'Per-instance OAuth ERP.',
  website: 'https://www.acme-erp.example',
  category: 'accounting',
  auth_type: 'oauth2',
  hq_country: 'US',
  docs_url: 'https://developer.acme-erp.example',
  pricing_url: 'https://www.acme-erp.example/pricing',
  founded_year: 2010,
  unsupported: {
    reason:
      "OAuth client must be registered inside each customer's own instance; not supported yet.",
    issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
  },
}

describe('normalizeRow — unsupported passthrough', () => {
  it('a supported platform normalises with no `unsupported` key at all', () => {
    const row = normalizeRow('accounting', SUPPORTED_RAW, { webhook: false, hasGuide: false })
    expect(row.unsupported).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(row, 'unsupported')).toBe(true)
    // Absent from JSON specifically — `undefined` values are dropped by
    // JSON.stringify even though the key exists on the JS object.
    expect(JSON.parse(JSON.stringify(row))).not.toHaveProperty('unsupported')
  })

  it('an unsupported platform carries its reason and issueUrl structurally', () => {
    const row = normalizeRow('accounting', UNSUPPORTED_RAW, { webhook: false, hasGuide: false })
    expect(row.unsupported).toEqual({
      reason: UNSUPPORTED_RAW.unsupported.reason,
      issueUrl: UNSUPPORTED_RAW.unsupported.issueUrl,
    })
    expect(JSON.parse(JSON.stringify(row))).toHaveProperty(
      'unsupported.reason',
      UNSUPPORTED_RAW.unsupported.reason,
    )
  })

  it('drops a malformed `unsupported` (no string reason) rather than throwing', () => {
    const row = normalizeRow(
      'accounting',
      { ...SUPPORTED_RAW, unsupported: { issueUrl: 'https://example.com' } },
      { webhook: false, hasGuide: false },
    )
    expect(row.unsupported).toBeUndefined()
  })

  it('omits issueUrl when the platform entry has none', () => {
    const row = normalizeRow(
      'accounting',
      { ...SUPPORTED_RAW, unsupported: { reason: 'No public API.' } },
      { webhook: false, hasGuide: false },
    )
    expect(row.unsupported).toEqual({ reason: 'No public API.' })
    expect(row.unsupported).not.toHaveProperty('issueUrl')
  })
})

describe('buildUnsupportedSection — platforms.md rendering', () => {
  it('renders nothing when no row is unsupported (byte-identical output today)', () => {
    const supported = normalizeRow('accounting', SUPPORTED_RAW, { webhook: false, hasGuide: false })
    expect(buildUnsupportedSection([supported])).toEqual([])
  })

  it('renders nothing for an empty row list', () => {
    expect(buildUnsupportedSection([])).toEqual([])
  })

  it('renders the section with a table row carrying the reason and an issue link', () => {
    const supported = normalizeRow('accounting', SUPPORTED_RAW, { webhook: false, hasGuide: false })
    const unsupported = normalizeRow('accounting', UNSUPPORTED_RAW, {
      webhook: false,
      hasGuide: false,
    })
    const lines = buildUnsupportedSection([supported, unsupported])
    const text = lines.join('\n')
    expect(text).toContain('## Unsupported platforms')
    expect(text).toContain('accounting')
    expect(text).toContain('`acme-erp`')
    expect(text).toContain('Acme ERP')
    expect(text).toContain(UNSUPPORTED_RAW.unsupported.reason)
    expect(text).toContain(`[link](${UNSUPPORTED_RAW.unsupported.issueUrl})`)
    // The supported row must not leak into the unsupported table.
    expect(text).not.toContain('Xero')
  })

  it('renders "—" for the issue column when a platform has no issueUrl', () => {
    const row = normalizeRow(
      'accounting',
      { ...UNSUPPORTED_RAW, unsupported: { reason: 'No public API.' } },
      { webhook: false, hasGuide: false },
    )
    const lines = buildUnsupportedSection([row])
    const dataLine = lines.find((l) => l.startsWith('| accounting |'))
    expect(dataLine).toBeDefined()
    expect(dataLine).toMatch(/\|\s*—\s*\|$/)
  })
})

describe('normalizeRow — verification passthrough', () => {
  it('an unverified platform normalises with no `verification` key in JSON at all', () => {
    const row = normalizeRow('accounting', SUPPORTED_RAW, { webhook: false, hasGuide: false })
    expect(row.verification).toBeUndefined()
    // Same absent-from-JSON discipline as `unsupported`: this is what keeps
    // platforms.json byte-identical for the 1,544 nobody has verified.
    expect(JSON.parse(JSON.stringify(row))).not.toHaveProperty('verification')
  })

  it('carries a valid tier through structurally', () => {
    const row = normalizeRow(
      'logistics',
      { ...SUPPORTED_RAW, verification: 'verified' },
      { webhook: false, hasGuide: false },
    )
    expect(row.verification).toBe('verified')
    expect(JSON.parse(JSON.stringify(row))).toHaveProperty('verification', 'verified')
  })

  it('drops an unknown tier rather than rendering a badge nobody can account for', () => {
    // sandbox-verified and production-verified are the two tiers `verified`
    // replaced in 2026-11; they must drop like any other unknown name.
    for (const bogus of [
      'sandbox-verified',
      'production-verified',
      'VERIFIED',
      'scaffolded',
      true,
      3,
      null,
      {},
    ]) {
      const row = normalizeRow(
        'logistics',
        { ...SUPPORTED_RAW, verification: bogus },
        { webhook: false, hasGuide: false },
      )
      expect(row.verification).toBeUndefined()
    }
  })
})

describe('buildVerificationSection — platforms.md rendering', () => {
  const unit = normalizeRow(
    'logistics',
    { ...SUPPORTED_RAW, slug: 'shipbob', name: 'ShipBob', verification: 'unit-tested' },
    { webhook: false, hasGuide: false },
  )
  const xero = normalizeRow(
    'accounting',
    { ...SUPPORTED_RAW, slug: 'xero', name: 'Xero', verification: 'verified' },
    { webhook: false, hasGuide: false },
  )
  const stripe = normalizeRow(
    'payments',
    { ...SUPPORTED_RAW, slug: 'stripe', name: 'Stripe', verification: 'verified' },
    { webhook: false, hasGuide: false },
  )
  const plain = normalizeRow('accounting', SUPPORTED_RAW, { webhook: false, hasGuide: false })

  it('renders nothing when nothing is verified (byte-identical output)', () => {
    expect(buildVerificationSection([plain])).toEqual([])
    expect(buildVerificationSection([])).toEqual([])
  })

  it('states the honest ratio against the full catalog, not just the verified subset', () => {
    const text = buildVerificationSection([unit, plain, plain, plain]).join('\n')
    expect(text).toContain('## Verification')
    expect(text).toContain('1 of 4 adapters have been exercised beyond scaffolding')
    expect(text).toContain('unit tested: 1')
  })

  it('lists only verified rows, strongest tier first', () => {
    const lines = buildVerificationSection([unit, xero, stripe, plain])
    const text = lines.join('\n')
    expect(text).toContain(
      '3 of 4 adapters have been exercised beyond scaffolding (unit tested: 1, verified: 2)',
    )
    expect(text).not.toContain('`xero-unverified`')
    const order = [
      text.indexOf('| `xero` | Xero | Verified |'),
      text.indexOf('| `stripe` | Stripe | Verified |'),
      text.indexOf('| `shipbob` | ShipBob | Unit tested |'),
    ]
    expect(order[0]).toBeGreaterThan(-1)
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[2])
  })

  it('points at the audit ledger so a reader can check the provenance', () => {
    const text = buildVerificationSection([unit]).join('\n')
    expect(text).toContain('scripts/adapter-verification-audit.json')
  })

  it('names every verified platform with its vertical and slug', () => {
    const text = buildVerificationSection([unit, xero, stripe]).join('\n')
    for (const [vertical, slug, name] of [
      ['logistics', 'shipbob', 'ShipBob'],
      ['accounting', 'xero', 'Xero'],
      ['payments', 'stripe', 'Stripe'],
    ]) {
      expect(text).toContain(`| ${vertical} | \`${slug}\` | ${name} |`)
    }
  })
})

describe('NormalizedRow type sanity', () => {
  it('a fully-populated row round-trips through JSON with every non-unsupported field', () => {
    const row: NormalizedRow = normalizeRow('logistics', SUPPORTED_RAW, {
      webhook: true,
      hasGuide: true,
    })
    const json = JSON.parse(JSON.stringify(row))
    expect(json).toMatchObject({
      vertical: 'logistics',
      slug: 'xero',
      name: 'Xero',
      webhook: true,
      has_guide: true,
      domain: 'xero.com',
    })
  })
})

describe('withReadmeTally — the README count', () => {
  const sentence =
    '**9 of 1,548** adapters have been exercised beyond scaffolding (1 unit tested, 8 verified).'
  const readme = [
    '# OpenSteward',
    '',
    '- **Adapter verification**: **8 of 1,548** adapters have been exercised beyond scaffolding (1 unit tested, 7 verified). Every other one ships unexercised.',
    '',
  ].join('\n')

  it('replaces the sentence and leaves the rest of the README alone', () => {
    const next = withReadmeTally(readme, sentence)
    expect(next).toBe(readme.replace(/\*\*8 of 1,548\*\*[^.]*\./, sentence))
    expect(next).toContain('- **Adapter verification**: **9 of 1,548**')
    expect(next).toContain('Every other one ships unexercised.')
  })

  it('is a no-op when the count is already current', () => {
    const current = withReadmeTally(readme, sentence)
    expect(withReadmeTally(current, sentence)).toBe(current)
  })

  it('throws when the README has no verification sentence', () => {
    expect(() => withReadmeTally('# OpenSteward\n', sentence)).toThrow(/exactly once, found 0/)
  })

  it('throws when the sentence appears twice', () => {
    expect(() => withReadmeTally(readme + readme, sentence)).toThrow(/exactly once, found 2/)
  })
})
