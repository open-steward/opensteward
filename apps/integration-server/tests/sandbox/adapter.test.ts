/**
 * The sandbox adapter, exercised the way a resource router uses it.
 *
 * Routers call `adapter.listInvoices(credentials, params)` and hand the result
 * to the response envelope, so these tests call the same methods and assert the
 * results survive the canonical schema — plus the two properties the whole
 * design rests on: that a write reads back, and that nothing reaches the network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  openDb,
  SandboxStore,
  SandboxNotFoundError,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { createSandboxAdapter } from '../../src/sandbox/adapter'
import { sandboxSpecsFor } from '../../src/sandbox/manifest'
import { InvoiceSchema } from '../../src/verticals/accounting/schema/invoice'
import { OrganizationSchema } from '../../src/verticals/accounting/schema/organization'

const CREDS = { accessToken: 'sandbox' }

interface Adapter {
  [method: string]: (...args: unknown[]) => Promise<never>
}

describe('sandbox adapter', () => {
  let handle: DbHandle
  let store: SandboxStore
  let adapter: Adapter

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await SandboxStore.create(handle)
    adapter = createSandboxAdapter({
      vertical: 'accounting',
      tenantId: 'acme',
      platform: 'xero',
      store,
      specs: sandboxSpecsFor('accounting'),
    }) as unknown as Adapter
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await handle?.close()
  })

  it('reports the connection’s real platform so meta.platform reads normally', () => {
    expect((adapter as unknown as { platform: string }).platform).toBe('xero')
  })

  it('exposes only the methods the manifest declares', () => {
    // An unlisted method must read as undefined so the router answers its own
    // 501, exactly as it does for a real adapter that lacks it.
    expect(typeof adapter['listInvoices']).toBe('function')
    expect(adapter['listUnicorns']).toBeUndefined()
    expect(adapter['deleteAccount']).toBeUndefined() // accounts are read-only
  })

  it('seeds on first read and returns schema-valid records', async () => {
    const invoices = (await adapter['listInvoices']!(CREDS, {})) as unknown as unknown[]
    expect(invoices.length).toBe(3)
    for (const invoice of invoices) {
      expect(InvoiceSchema.safeParse(invoice).success).toBe(true)
    }
  })

  it('keeps the documented id on the first record', async () => {
    const [first] = (await adapter['listInvoices']!(CREDS, {})) as unknown as Array<{ id: string }>
    expect(first!.id).toBe('inv_1042')
  })

  it('gives every seeded record a distinct id', async () => {
    const invoices = (await adapter['listInvoices']!(CREDS, {})) as unknown as Array<{ id: string }>
    expect(new Set(invoices.map((i) => i.id)).size).toBe(invoices.length)
  })

  it('is stable across calls — seeding happens once', async () => {
    const a = (await adapter['listInvoices']!(CREDS, {})) as unknown as Array<{ id: string }>
    const b = (await adapter['listInvoices']!(CREDS, {})) as unknown as Array<{ id: string }>
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id))
    expect(await store.countFor('acme', 'accounting')).toBeLessThan(60)
  })

  it('revives dates, so a read is schema-valid after the JSON round-trip', async () => {
    const invoice = (await adapter['getInvoice']!(CREDS, 'inv_1042')) as unknown as {
      postedAt: unknown
      createdAt: unknown
    }
    // Revival still turns a stored ISO string back into a Date for the fields
    // that are instants…
    expect(invoice.createdAt).toBeInstanceOf(Date)
    // …and must NOT do so for a calendar date, which would re-introduce the
    // fabricated midnight-UTC the date-or-date-time union exists to avoid.
    expect(invoice.postedAt).toBe('2026-02-01')
    // The point of the test either way: it still parses.
    expect(InvoiceSchema.safeParse(invoice).success).toBe(true)
  })

  it('round-trips a create: POST then GET returns it', async () => {
    const created = (await adapter['createInvoice']!(CREDS, {
      invoiceNumber: 'INV-NEW',
    })) as unknown as { id: string; invoiceNumber: string }
    expect(created.invoiceNumber).toBe('INV-NEW')
    const fetched = (await adapter['getInvoice']!(CREDS, created.id)) as unknown as {
      invoiceNumber: string
    }
    expect(fetched.invoiceNumber).toBe('INV-NEW')
    expect(InvoiceSchema.safeParse(fetched).success).toBe(true)
  })

  it('drops body keys the schema does not declare', async () => {
    // Otherwise the sandbox is an echo oracle and an arbitrary blob store.
    const created = (await adapter['createInvoice']!(CREDS, {
      invoiceNumber: 'INV-1',
      nonsense: 'should not persist',
    })) as unknown as Record<string, unknown>
    expect('nonsense' in created).toBe(false)
    expect(InvoiceSchema.safeParse(created).success).toBe(true)
  })

  it('updates in place', async () => {
    await adapter['updateInvoice']!(CREDS, 'inv_1042', { invoiceNumber: 'INV-EDITED' })
    const fetched = (await adapter['getInvoice']!(CREDS, 'inv_1042')) as unknown as {
      invoiceNumber: string
    }
    expect(fetched.invoiceNumber).toBe('INV-EDITED')
  })

  it('deletes, and a deleted record is then a miss', async () => {
    await adapter['deleteInvoice']!(CREDS, 'inv_1042')
    await expect(adapter['getInvoice']!(CREDS, 'inv_1042')).rejects.toBeInstanceOf(
      SandboxNotFoundError,
    )
  })

  it('raises a typed not-found the plugin maps to 404', async () => {
    await expect(adapter['getInvoice']!(CREDS, 'nope')).rejects.toBeInstanceOf(SandboxNotFoundError)
    await expect(adapter['deleteInvoice']!(CREDS, 'nope')).rejects.toBeInstanceOf(
      SandboxNotFoundError,
    )
  })

  it('handles the singleton, which takes no id argument', async () => {
    // getOrganization(credentials) — the one irregular shape in accounting.
    const org = await adapter['getOrganization']!(CREDS)
    expect(OrganizationSchema.safeParse(org).success).toBe(true)
  })

  it('honours limit and page', async () => {
    const page1 = (await adapter['listInvoices']!(CREDS, {
      page: 1,
      limit: 2,
    })) as unknown as unknown[]
    const page2 = (await adapter['listInvoices']!(CREDS, {
      page: 2,
      limit: 2,
    })) as unknown as unknown[]
    expect(page1.length).toBe(2)
    expect(page2.length).toBe(1)
  })

  it('reports the exact count and whether more pages remain', async () => {
    // The sandbox holds the whole collection, so it can say exactly. The
    // router's limit+1 probe used to answer `hasMore` for it; with the probe
    // gone, a full page with no report would be `null`.
    const envelope = async (page: number) => {
      const params = parseListQuery({ limit: '2', page: String(page) })
      return listPage(
        (await adapter['listInvoices']!(CREDS, params)) as unknown[],
        params,
        'sandbox',
      ).meta
    }
    expect(await envelope(1)).toMatchObject({ totalCount: 3, hasMore: true })
    expect(await envelope(2)).toMatchObject({ totalCount: 3, hasMore: false })
  })

  it('honours search', async () => {
    await adapter['createInvoice']!(CREDS, { invoiceNumber: 'FINDME-9' })
    const hits = (await adapter['listInvoices']!(CREDS, {
      search: 'findme-9',
    })) as unknown as unknown[]
    expect(hits.length).toBe(1)
  })

  it('isolates tenants', async () => {
    await adapter['createInvoice']!(CREDS, { invoiceNumber: 'ACME-ONLY' })
    const other = createSandboxAdapter({
      vertical: 'accounting',
      tenantId: 'globex',
      platform: 'xero',
      store,
      specs: sandboxSpecsFor('accounting'),
    }) as unknown as Adapter
    const theirs = (await other['listInvoices']!(CREDS, {})) as unknown as Array<{
      invoiceNumber?: string
    }>
    expect(theirs.some((i) => i.invoiceNumber === 'ACME-ONLY')).toBe(false)
  })

  it('refuses OAuth entry points rather than pretending', async () => {
    const a = adapter as unknown as { getAuthUrl: () => string; refreshCredentials: () => unknown }
    expect(() => a.getAuthUrl()).toThrow(/not available in test mode/)
    expect(() => a.refreshCredentials()).toThrow(/not refreshable in test mode/)
  })

  it('never makes an outbound request across a full read/write sweep', async () => {
    // The boundary is structural — no credentials and no real adapter exist on
    // this path — but a tripwire catches a future import that forgets that.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const spec of sandboxSpecsFor('accounting')) {
      if (spec.list) await adapter[spec.list]!(CREDS, {})
      if (spec.get && spec.singletonId) await adapter[spec.get]!(CREDS)
      if (spec.create) await adapter[spec.create]!(CREDS, {})
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
