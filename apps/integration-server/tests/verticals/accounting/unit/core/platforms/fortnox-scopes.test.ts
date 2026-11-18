/**
 * Fortnox scopes are plain resource names — there are no `<resource>.read`
 * variants — and an unsupported scope fails authorize with:
 *
 *   /auth/accounting/fortnox/callback?error=invalid_scope
 *     &error_description=An+unsupported+scope+was+requested
 *
 * Per Fortnox's own documentation, "All scopes gives both read and write
 * access to an endpoint and it is not possible to only have read access
 * through the API", so a read-only scope set cannot exist for this platform
 * at all. READ_SCOPES must not claim one: that would make a `read_only`
 * Connect Link look honoured while requesting write-granting scopes.
 *
 * Source: https://www.fortnox.se/developer/guides-and-good-to-know/scopes
 */
import { describe, it, expect } from 'vitest'
import {
  READ_SCOPES,
  RECOMMENDED_SCOPES_EXTRA,
} from '../../../../../../src/verticals/accounting/platforms/read-scopes.generated'

/** Every scope Fortnox documents, verbatim. */
const FORTNOX_DOCUMENTED = new Set([
  'salary',
  'bookkeeping',
  'archive',
  'article',
  'assets',
  'costcenter',
  'currency',
  'customer',
  'inbox',
  'invoice',
  'payment',
  'noxfinansinvoice',
  'offer',
  'order',
  'price',
  'print',
  'project',
  'profile',
  'supplierinvoice',
  'supplier',
  'timereporting',
  'warehouse',
  'warehousecustomdocument',
  'connectfile',
  'companyinformation',
  'settings',
])

describe('Fortnox OAuth scopes', () => {
  it('offers only scopes Fortnox actually accepts', () => {
    const offered = RECOMMENDED_SCOPES_EXTRA['fortnox'] ?? []
    const unknown = offered.filter((s) => !FORTNOX_DOCUMENTED.has(s))
    expect(unknown).toEqual([])
  })

  it('offers no .read variants, which Fortnox does not implement', () => {
    const offered = RECOMMENDED_SCOPES_EXTRA['fortnox'] ?? []
    expect(offered.filter((s) => s.endsWith('.read'))).toEqual([])
  })

  it('claims no read-only scope set, because Fortnox has none', () => {
    // Absent (rather than empty) so resolveOverrideScopesFor falls through to
    // the platform default instead of requesting an empty scope list.
    expect(READ_SCOPES['fortnox']).toBeUndefined()
  })

  it('still offers the scopes the adapter needs to read its resources', () => {
    const offered = new Set(RECOMMENDED_SCOPES_EXTRA['fortnox'] ?? [])
    for (const needed of ['companyinformation', 'invoice', 'customer', 'supplier', 'supplierinvoice', 'payment', 'bookkeeping']) {
      expect(offered.has(needed), `missing ${needed}`).toBe(true)
    }
  })
})
