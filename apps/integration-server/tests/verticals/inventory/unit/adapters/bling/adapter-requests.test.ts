/**
 * Pins the actual HTTP requests bling's supplier list sends — an audit
 * found listSuppliers filtered contacts with { tipo: 'F' }, which is not a
 * /contatos query param at all (tipo is the *person* type on a contact
 * record: F=Fisica/individual, J=Juridica/company, E=Estrangeira), and the
 * default criterio (3, "recently added") silently dropped older suppliers.
 * The transform tests never caught this because they only exercise the
 * mapping function, not the request the adapter actually sends.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { BlingAdapter } from '../../../../../../src/verticals/inventory/adapters/bling'
import { BlingClient } from '../../../../../../src/verticals/inventory/adapters/bling/client'

const creds = { accessToken: 'tok' } as Credentials

function adapter(): BlingAdapter {
  return new BlingAdapter({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/callback',
  })
}

afterEach(() => vi.restoreAllMocks())

describe('BlingAdapter listSuppliers requests', () => {
  it('resolves the "Fornecedor" contact type id from GET /contatos/tipos, then filters /contatos by idTipoContato and criterio=1 — not { tipo: "F" }', async () => {
    const get = vi.spyOn(BlingClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/contatos/tipos') {
        return {
          data: [
            { id: 9, descricao: 'Cliente' },
            { id: 12345678, descricao: 'Fornecedor' },
          ],
        } as never
      }
      return { data: [] } as never
    })

    await adapter().listSuppliers(creds, {})

    expect(get).toHaveBeenNthCalledWith(1, '/contatos/tipos')
    expect(get).toHaveBeenNthCalledWith(2, '/contatos', {
      pagina: 1,
      limite: 100,
      idTipoContato: 12345678,
      criterio: 1,
    })
  })

  it('matches the "Fornecedor" descricao case-insensitively', async () => {
    const get = vi.spyOn(BlingClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/contatos/tipos') {
        return { data: [{ id: 5, descricao: 'FORNECEDOR' }] } as never
      }
      return { data: [] } as never
    })

    await adapter().listSuppliers(creds, {})

    expect(get).toHaveBeenNthCalledWith(2, '/contatos', {
      pagina: 1,
      limite: 100,
      idTipoContato: 5,
      criterio: 1,
    })
  })

  it('throws when no "Fornecedor" contact type is found, instead of silently filtering by tipo:"F"', async () => {
    vi.spyOn(BlingClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/contatos/tipos') {
        return { data: [{ id: 1, descricao: 'Cliente' }] } as never
      }
      return { data: [] } as never
    })

    await expect(adapter().listSuppliers(creds, {})).rejects.toThrow(/Fornecedor/)
  })

  it('passes explicit pagination through to the filtered /contatos call', async () => {
    const get = vi.spyOn(BlingClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path === '/contatos/tipos') {
        return { data: [{ id: 12345678, descricao: 'Fornecedor' }] } as never
      }
      return { data: [] } as never
    })

    await adapter().listSuppliers(creds, { page: 3, limit: 25 })

    expect(get).toHaveBeenNthCalledWith(2, '/contatos', {
      pagina: 3,
      limite: 25,
      idTipoContato: 12345678,
      criterio: 1,
    })
  })
})
