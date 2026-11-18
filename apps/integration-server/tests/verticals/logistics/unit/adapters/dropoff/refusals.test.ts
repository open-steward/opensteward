/**
 * Dropoff runs on CXT Software's X Dispatch web service. Its published
 * OpenAPI (https://dropoff.cxtsoftware.net/CxtWebService/CXTWCF.svc/swagger/v1/swagger.json)
 * has no client-facing collection for carriers, labels or manifests, so
 * these methods refuse with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { DropoffAdapter } from '../../../../../../src/verticals/logistics/adapters/dropoff/index'

const adapter = new DropoffAdapter()
const CREDS = { accessToken: 'tok' }
const PAGE = { page: 1, limit: 5 }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const REFUSALS: [string, () => Promise<unknown>, RegExp][] = [
  ['listCarriers', () => adapter.listCarriers(CREDS, PAGE), /Dropoff cannot list carriers/],
  ['getCarrier', () => adapter.getCarrier(CREDS, 'c1'), /Dropoff cannot list carriers/],
  [
    'listManifests',
    () => adapter.listManifests(CREDS, PAGE),
    /Dropoff cannot list manifests: .*consolidation manifests/,
  ],
  ['getManifest', () => adapter.getManifest(CREDS, 'm1'), /Dropoff cannot list manifests/],
  ['listLabels', () => adapter.listLabels(CREDS, PAGE), /Dropoff cannot list labels/],
  ['getLabel', () => adapter.getLabel(CREDS, 'l1'), /Dropoff cannot list labels/],
]

describe('dropoff refuses what the X Dispatch API cannot list', () => {
  it.each(REFUSALS)('%s throws 501 NOT_SUPPORTED and sends nothing', async (_name, run, msg) => {
    const create = vi.spyOn(axios, 'create')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(run()).rejects.toThrow(msg)
    expect(create).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
