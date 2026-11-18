/**
 * Orca Scan getLocation reads the sheet from GET /sheets.
 *
 * Orca Scan's OpenAPI spec (https://api.orcascan.com/v1/openapi.json) has no
 * GET /sheets/{sheetId}. The adapter used GET /sheets/{sheetId}/settings,
 * whose SheetSettings carries neither `_id` nor `name`, so the Location came
 * back with no id and no name (failing LocationSchema), and its `raw` held the
 * webhook `secret` ("Shared secret sent with webhook requests") and the
 * `itemLinkPin` and `qrFormPin`, which went on to every API reader.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { OrcaScanAdapter } from '../../../../../../src/verticals/inventory/adapters/orca-scan/index'
import { LocationSchema } from '../../../../../../src/verticals/inventory/schema/location'

const CREDS = { accessToken: 'orca_test' }

/** Two sheets from the GET /sheets example in Orca Scan's REST guide. */
const SHEETS = [
  {
    _id: '62a3188f098a6343fe0d9c1b',
    name: 'Public API Owned',
    isOwner: true,
    canAdmin: true,
    canUpdate: true,
    canDelete: true,
    canExport: true,
  },
  {
    _id: '62a31e89098a6343fe0d9c1e',
    name: 'Public API Readonly',
    isOwner: false,
    canAdmin: false,
    canUpdate: false,
    canDelete: false,
    canExport: false,
  },
]

/**
 * The GET /sheets/:sheetId/settings example from the guide (no `_id`, no
 * `name`, a `secret`), plus the read-only PINs SheetSettings adds in the spec.
 */
const SETTINGS = {
  allowPublicExport: true,
  publicExportUrl: 'https://api.orcascan.com/v1/sheets/sVVKYsnp-9b7Rl7i.json',
  allowPublicEntry: false,
  allowWebHookIn: false,
  webHookInUrl: 'https://api.orcascan.com/v1/sheets/XbC5Xc1CMgv9wq-C',
  webHookOutUrl: '',
  secret: 'G4t3k33p3r!',
  itemLinkPin: '1234',
  qrFormPin: '5678',
}

function fakeOrca(sheetsBody: unknown = { data: SHEETS }) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (Object.keys(cfg?.params ?? {}).length > 0) throw new Error(`unexpected params on ${path}`)
    if (path === '/sheets') return { data: sheetsBody }
    if (/^\/sheets\/[^/]+\/settings$/.test(path)) return { data: { data: SETTINGS } }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

afterEach(() => vi.restoreAllMocks())

describe('orca-scan getLocation', () => {
  it('returns the sheet with its id and name, valid against LocationSchema', async () => {
    fakeOrca()
    const loc = await new OrcaScanAdapter().getLocation(CREDS, SHEETS[1]!._id)
    expect(loc).toEqual(
      expect.objectContaining({
        id: SHEETS[1]!._id,
        externalId: SHEETS[1]!._id,
        name: 'Public API Readonly',
      }),
    )
    expect(() => LocationSchema.parse(loc)).not.toThrow()
  })

  it('never reads the settings, so no webhook secret or PIN reaches the Location', async () => {
    const { get } = fakeOrca()
    const loc = await new OrcaScanAdapter().getLocation(CREDS, SHEETS[0]!._id)
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/sheets'])
    const text = JSON.stringify(loc)
    for (const leaked of [
      'G4t3k33p3r!',
      'secret',
      'itemLinkPin',
      'qrFormPin',
      'XbC5Xc1CMgv9wq-C',
    ]) {
      expect(text).not.toContain(leaked)
    }
  })

  it('agrees with listLocations: every listed id round-trips', async () => {
    fakeOrca()
    const a = new OrcaScanAdapter()
    for (const listed of await a.listLocations(CREDS, {})) {
      expect(await a.getLocation(CREDS, listed.id)).toEqual(listed)
    }
  })

  it('an id that is not a sheet of this key is not found', async () => {
    fakeOrca()
    await expect(new OrcaScanAdapter().getLocation(CREDS, 'nope')).rejects.toThrow(
      'orca-scan sheet nope not found',
    )
  })

  it('a /sheets body with no data array is not found, not a crash', async () => {
    fakeOrca({})
    await expect(new OrcaScanAdapter().getLocation(CREDS, SHEETS[0]!._id)).rejects.toThrow(
      /not found/,
    )
  })
})
