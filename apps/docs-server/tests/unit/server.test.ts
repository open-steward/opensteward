import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { createServer, type Server } from 'http'
import {
  _resetServerVariablesCache,
  composePostmanBaseUrl,
  fetchServerVariables,
  hasUnifiedSpec,
  swaggerHtml,
  landingHtml,
} from '../../src/server'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'docs-server-test-'))
}

describe('docs-server', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  describe('hasUnifiedSpec', () => {
    it('returns false when openapi.json is missing', () => {
      expect(hasUnifiedSpec('/tmp/nonexistent-docs-dir')).toBe(false)
    })

    it('returns true when openapi.json exists', () => {
      dir = makeTmpDir()
      writeFileSync(join(dir, 'openapi.json'), '{}')
      expect(hasUnifiedSpec(dir)).toBe(true)
    })
  })

  describe('swaggerHtml', () => {
    it('renders a single Swagger UI loading the unified spec', () => {
      const html = swaggerHtml()
      expect(html).toContain('Unified API - Documentation - OpenSteward')
      expect(html).toContain('/specs/openapi.json')
      expect(html).toContain('/specs/openapi.yaml')
      expect(html).toContain('swagger-ui')
      expect(html).toContain('/design/tokens.css')
      // Tag deep-linking is what makes /docs#tag/Accounting jump to the right
      // section, so the SwaggerUIBundle config must keep deepLinking on.
      expect(html).toContain('deepLinking: true')
    })

    // The adapter dropdown is filtered by the chosen vertical. OpenAPI cannot
    // express that — Swagger UI builds a parameter's <select> from that one
    // schema node and ignores if/then and dependentSchemas for Try-it-out — so
    // the cascade is page JS, and these assert its three load-bearing pieces.
    it('ships the vertical-to-adapter cascade', () => {
      const html = swaggerHtml()
      // Catalog source: already served, already carries {slug, name, vertical}.
      expect(html).toContain('/specs/platform-slugs.json')
      // Swagger renders each parameter as <tr data-param-name=…>; the cascade
      // finds the two selects through that attribute.
      expect(html).toContain('data-param-name')
      // Re-wire on re-render: Swagger rebuilds opblocks when a tag expands.
      expect(html).toContain('safeCascade')
    })

    it('keeps the cascade non-fatal, so a Swagger DOM change cannot break the page', () => {
      // Swagger UI is loaded from an unpinned CDN tag, so the DOM it renders
      // can change without a change here. Every entry point is guarded.
      const html = swaggerHtml()
      expect(html).toMatch(/try \{ wireAdapterCascade\(\); \} catch/)
      expect(html).toContain(".catch(function () { return null; })")
    })
  })

  describe('landingHtml', () => {
    it('renders the four vertical cards anchored to Swagger UI tags', () => {
      const html = landingHtml(true)
      // Each vertical anchors at /unified-api#tag/<Vertical>, the Swagger UI
      // mount point (it was /api-reference until the rename that paired it
      // with /operator-api; that path now 301s here).
      expect(html).toContain('/unified-api#tag/Accounting')
      expect(html).toContain('/unified-api#tag/CRM')
      expect(html).toContain('/unified-api#tag/Ecommerce')
      expect(html).toContain('/unified-api#tag/Logistics')
      expect(html).not.toContain('/api-reference')
      expect(html).toContain('OpenSteward')
      // No per-vertical /accounting routes any more
      expect(html).not.toContain('href="/accounting"')
    })

    // Each card's meta row offers the vertical's adapters (the /platforms
    // catalog, deep-linked to that vertical's pill) and its endpoints (the
    // Swagger tag the old "browse" link pointed at).
    it.each([
      ['accounting', 'Accounting', 'Accounting'],
      ['crm', 'CRM', 'CRM'],
      ['docsign', 'Docsign', 'Docsign'],
      ['customer-support', 'Customer support', 'CustomerSupport'],
      ['inventory', 'Inventory', 'Inventory'],
    ])('links the %s card to its adapters and its endpoints', (slug, label, tag) => {
      const html = landingHtml(true)
      expect(html).toContain(
        `<a href="/platforms#vertical=${slug}" class="mono">Browse ${label} adapters</a>`,
      )
      expect(html).toContain(`<a href="/unified-api#tag/${tag}" class="mono">View endpoints</a>`)
      // The title stays on the endpoints: the section is about API shape.
      expect(html).toContain(
        `<a class="vertical-card__title-link" href="/unified-api#tag/${tag}">${label}</a>`,
      )
    })

    it('renders one adapters link and one endpoints link per vertical, and no bare browse/openapi.json pair', () => {
      const html = landingHtml(true)
      const cards = html.match(/<article class="vertical-card">[\s\S]*?<\/article>/g) ?? []
      const verticalCards = cards.filter((c) => c.includes('/platforms#vertical='))
      expect(verticalCards).toHaveLength(9)
      for (const card of verticalCards) {
        expect(card.match(/>Browse [^<]+ adapters<\/a>/g)).toHaveLength(1)
        expect(card.match(/>View endpoints<\/a>/g)).toHaveLength(1)
        expect(card).not.toContain('>browse</a>')
        expect(card).not.toContain('>openapi.json</a>')
      }
    })

    it('shows the empty state when no spec is present', () => {
      const html = landingHtml(false)
      expect(html).toContain('Documentation - OpenSteward')
    })
  })

  describe('fetchServerVariables', () => {
    let stub: { server: Server; url: string } | null = null
    let prevEnv: string | undefined

    beforeEach(() => {
      _resetServerVariablesCache()
      prevEnv = process.env['INTEGRATION_SERVER_URL']
    })
    afterEach(() => {
      stub?.server.close()
      stub = null
      if (prevEnv === undefined) delete process.env['INTEGRATION_SERVER_URL']
      else process.env['INTEGRATION_SERVER_URL'] = prevEnv
    })

    it('returns null when INTEGRATION_SERVER_URL is unset', async () => {
      delete process.env['INTEGRATION_SERVER_URL']
      expect(await fetchServerVariables()).toBeNull()
    })

    it('returns the parsed body on success', async () => {
      stub = await startStub({
        scheme: { default: 'https', enum: ['https', 'http'] },
        host: { default: 'oi.acme.com', enum: ['oi.acme.com'] },
        port: { default: '443', enum: ['443'] },
      })
      process.env['INTEGRATION_SERVER_URL'] = stub.url
      const out = await fetchServerVariables()
      expect(out?.host?.default).toBe('oi.acme.com')
      expect(out?.port?.default).toBe('443')
    })

    it('fails open (returns null) on integration-server error', async () => {
      stub = await startStub({ error: 'boom' }, 500)
      process.env['INTEGRATION_SERVER_URL'] = stub.url
      expect(await fetchServerVariables()).toBeNull()
    })

    it('fails open when INTEGRATION_SERVER_URL is unreachable', async () => {
      process.env['INTEGRATION_SERVER_URL'] = 'http://127.0.0.1:1' // refused
      expect(await fetchServerVariables()).toBeNull()
    })
  })
})

describe('composePostmanBaseUrl', () => {
  it('falls back to localhost:3010 when no overrides', () => {
    expect(composePostmanBaseUrl(null)).toBe('http://localhost:3010')
  })

  it('omits :443 on https', () => {
    expect(composePostmanBaseUrl({
      scheme: { default: 'https' },
      host: { default: 'oi.acme.com' },
      port: { default: '443' },
    })).toBe('https://oi.acme.com')
  })

  it('omits :80 on http', () => {
    expect(composePostmanBaseUrl({
      scheme: { default: 'http' },
      host: { default: 'oi.acme.com' },
      port: { default: '80' },
    })).toBe('http://oi.acme.com')
  })

  it('keeps non-default port', () => {
    expect(composePostmanBaseUrl({
      scheme: { default: 'http' },
      host: { default: 'localhost' },
      port: { default: '3010' },
    })).toBe('http://localhost:3010')
  })

  it('keeps non-default port on https', () => {
    expect(composePostmanBaseUrl({
      scheme: { default: 'https' },
      host: { default: 'oi-staging.acme.com' },
      port: { default: '8443' },
    })).toBe('https://oi-staging.acme.com:8443')
  })
})

function startStub(body: unknown, statusCode = 200): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(statusCode, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}
