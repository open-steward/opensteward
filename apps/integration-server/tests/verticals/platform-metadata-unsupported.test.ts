/**
 * Every vertical's `PLATFORMS` array may mark an entry `unsupported: {
 * reason, issueUrl? }` (see `UnsupportedPlatform` in
 * `@opensteward/shared`'s reference module). The field is free text shown
 * verbatim in admin, the catalog and API refusal errors, so it has exactly
 * two guarantees worth enforcing here: a non-empty `reason`, and an
 * `issueUrl` — when present — that actually points at this repo's issue
 * tracker rather than an arbitrary URL.
 *
 * No entry declares `unsupported` yet (this task only adds the mechanism),
 * so the "every declared entry is valid" checks below pass vacuously today.
 * `isValidUnsupported` is exercised directly against good and bad fixtures
 * so the check is proven capable of failing, not merely capable of finding
 * nothing to complain about.
 */
import { describe, it, expect } from 'vitest'
import type { UnsupportedPlatform } from '@opensteward/shared'
import { PLATFORMS as ACCOUNTING_PLATFORMS } from '../../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM_PLATFORMS } from '../../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE_PLATFORMS } from '../../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS_PLATFORMS } from '../../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as PAYMENTS_PLATFORMS } from '../../src/verticals/payments/platforms/metadata'
import { PLATFORMS as DOCSIGN_PLATFORMS } from '../../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS_PLATFORMS } from '../../src/verticals/projects/platforms/metadata'
import { PLATFORMS as CS_PLATFORMS } from '../../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INV_PLATFORMS } from '../../src/verticals/inventory/platforms/metadata'

const VERTICALS: ReadonlyArray<{
  name: string
  platforms: ReadonlyArray<{ slug: string; unsupported?: UnsupportedPlatform }>
}> = [
  { name: 'accounting', platforms: ACCOUNTING_PLATFORMS },
  { name: 'crm', platforms: CRM_PLATFORMS },
  { name: 'ecommerce', platforms: ECOMMERCE_PLATFORMS },
  { name: 'logistics', platforms: LOGISTICS_PLATFORMS },
  { name: 'payments', platforms: PAYMENTS_PLATFORMS },
  { name: 'docsign', platforms: DOCSIGN_PLATFORMS },
  { name: 'projects', platforms: PROJECTS_PLATFORMS },
  { name: 'customer-support', platforms: CS_PLATFORMS },
  { name: 'inventory', platforms: INV_PLATFORMS },
]

const ISSUE_URL_RE = /^https:\/\/github\.com\/open-steward\/opensteward\/issues\/\d+$/

/**
 * The validation an `unsupported` entry must pass: a non-empty trimmed
 * `reason`, and — when `issueUrl` is present — a URL matching this repo's
 * issue tracker exactly (not merely "starts with https://" or "contains
 * github.com"). Returns `true` for `undefined` — declaring nothing is valid;
 * this function only judges what IS declared.
 */
function isValidUnsupported(u: UnsupportedPlatform | undefined): boolean {
  if (u === undefined) return true
  if (typeof u.reason !== 'string' || u.reason.trim().length === 0) return false
  if (u.issueUrl !== undefined && !ISSUE_URL_RE.test(u.issueUrl)) return false
  return true
}

describe('platform metadata: unsupported entries', () => {
  for (const { name, platforms } of VERTICALS) {
    it(`${name}: every declared 'unsupported' has a non-empty reason and a valid issueUrl`, () => {
      const offenders = platforms
        .filter((p) => p.unsupported !== undefined && !isValidUnsupported(p.unsupported))
        .map((p) => p.slug)
      expect(offenders).toEqual([])
    })
  }

  it('sanity: at least one platform exists across the 9 verticals (the loop above cannot vacuously pass)', () => {
    const total = VERTICALS.reduce((n, v) => n + v.platforms.length, 0)
    expect(total).toBeGreaterThan(0)
  })

  describe('isValidUnsupported — proves the check itself can fail', () => {
    it('rejects an empty or whitespace-only reason', () => {
      expect(isValidUnsupported({ reason: '' })).toBe(false)
      expect(isValidUnsupported({ reason: '   ' })).toBe(false)
    })

    it('rejects a non-github, non-opensteward, or non-issues issueUrl', () => {
      expect(isValidUnsupported({ reason: 'ok', issueUrl: 'https://evil.example/1' })).toBe(false)
      expect(
        isValidUnsupported({ reason: 'ok', issueUrl: 'https://github.com/open-steward/other-repo/issues/1' }),
      ).toBe(false)
      expect(
        isValidUnsupported({ reason: 'ok', issueUrl: 'https://github.com/open-steward/opensteward/pull/1' }),
      ).toBe(false)
      expect(isValidUnsupported({ reason: 'ok', issueUrl: 'http://github.com/open-steward/opensteward/issues/1' })).toBe(
        false,
      )
    })

    it('accepts a well-formed entry with and without issueUrl', () => {
      expect(isValidUnsupported({ reason: 'API retired, no successor' })).toBe(true)
      expect(
        isValidUnsupported({
          reason: 'Per-instance OAuth client',
          issueUrl: 'https://github.com/open-steward/opensteward/issues/445',
        }),
      ).toBe(true)
    })
  })
})
