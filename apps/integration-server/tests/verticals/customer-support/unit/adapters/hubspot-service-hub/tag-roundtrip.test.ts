import { describe, it, expect, vi, afterEach } from 'vitest'
import { HubspotServiceHubAdapter } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub'
import { HubspotServiceHubClient } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/client'
import type { Credentials } from '@opensteward/shared'

/**
 * `listTags` returns ids from a ticket property's enum options
 * (`/crm/v3/properties/tickets/hs_tag_ids`); `getTag` reads HubSpot's separate
 * CRM object-tags namespace (`/crm/object-tags/2026-09/{objectTypeId}/{id}`).
 * Two id spaces — so an id from the list 404s when passed to the get, and the
 * ordinary list-then-get pattern is broken for tags on this adapter.
 *
 * The issue suggested moving `listTags` onto the object-tags namespace, which
 * assumes that namespace has a bulk-list endpoint. That could not be
 * confirmed: HubSpot's published spec index names
 * `crm-object-tags-v2026-09.json`, and the file itself 404s, so no listing
 * operation is verifiable. Moving the list onto an endpoint whose existence is
 * unproven would trade a broken get for a broken list.
 *
 * So `getTag` resolves across both instead: the object-tags read first,
 * because it carries colour and description the enum options do not, then the
 * property options when that id is not in the object-tags space. Both routes
 * are ones the adapter already calls, so nothing here rests on an unverified
 * endpoint, and an id from `listTags` now round-trips by construction.
 */

const CREDS = { accessToken: 'tok' } as Credentials

const adapter = (): HubspotServiceHubAdapter =>
  new HubspotServiceHubAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

const TAG_OPTIONS = {
  options: [
    { label: 'Billing', value: 'billing', displayOrder: 0, hidden: false },
    { label: 'Urgent', value: 'urgent', displayOrder: 1, hidden: false },
    { label: 'Retired', value: 'retired', displayOrder: 2, hidden: true },
  ],
}

function notFound(): Error {
  const err = new Error('Request failed with status code 404') as Error & {
    response?: { status: number }
  }
  err.response = { status: 404 }
  return err
}

afterEach(() => vi.restoreAllMocks())

describe('hubspot-service-hub tag id round-trip', () => {
  it('resolves an id that listTags returned', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/properties/tickets/hs_tag_ids')) return TAG_OPTIONS as never
      // The object-tags namespace does not know a property-option value.
      throw notFound()
    })

    const a = adapter()
    const listed = await a.listTags(CREDS, {})
    const first = listed[0]!
    const fetched = await a.getTag(CREDS, first.id)

    expect(fetched.id).toBe(first.id)
    expect(fetched.name).toBe(first.name)
  })

  it('still prefers the object-tags record, which carries colour', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/crm/object-tags/')) {
        return { id: 'ot-1', name: 'Billing', color: '#ff0000', objectTypeId: '0-5' } as never
      }
      return TAG_OPTIONS as never
    })

    const tag = await adapter().getTag(CREDS, 'ot-1')
    expect(tag.id).toBe('ot-1')
    expect(tag.color).toBe('#ff0000')
  })

  it('does not fall back to a hidden option', async () => {
    // Hidden options are filtered out of listTags, so resolving one would
    // hand back a tag the list says does not exist.
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/properties/tickets/hs_tag_ids')) return TAG_OPTIONS as never
      throw notFound()
    })
    await expect(adapter().getTag(CREDS, 'retired')).rejects.toThrow()
  })

  it('reports an id in neither namespace as not found', async () => {
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/properties/tickets/hs_tag_ids')) return TAG_OPTIONS as never
      throw notFound()
    })
    await expect(adapter().getTag(CREDS, 'nope')).rejects.toThrow(/nope/)
  })

  it('does not swallow a non-404 failure from the object-tags read', async () => {
    // A 500 or an auth failure must surface, not silently degrade into a
    // property-options lookup that answers a different question.
    const boom = new Error('Request failed with status code 500') as Error & {
      response?: { status: number }
    }
    boom.response = { status: 500 }
    vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation(async () => {
      throw boom
    })
    await expect(adapter().getTag(CREDS, 'ot-1')).rejects.toThrow(/500/)
  })
})
