/**
 * Clientify links related records by hyperlink, e.g. a deal's
 * "contact": "https://api.clientify.net/v1/contacts/65542/" (List Deals,
 * https://developer.clientify.com/). The id is the whole last path segment.
 */
import { describe, it, expect } from 'vitest'
import { idFromUrl } from '../../../../../../src/verticals/crm/adapters/clientify/url-id'

describe('clientify idFromUrl', () => {
  it('reads the numeric last segment of a documented hyperlink', () => {
    expect(idFromUrl('https://api.clientify.net/v1/contacts/65542/')).toBe('65542')
  })

  it('rejects a last segment that is not wholly numeric', () => {
    expect(idFromUrl('https://api.clientify.net/v1/contacts/abc123/')).toBeUndefined()
  })

  it('returns undefined for a missing link', () => {
    expect(idFromUrl(null)).toBeUndefined()
    expect(idFromUrl(undefined)).toBeUndefined()
  })
})
