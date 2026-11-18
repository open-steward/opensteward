/**
 * The avatar fetch must give back every resource it takes, within its budget:
 * sockets (a 404 that trickles a body forever), DNS work (a nameserver that
 * never answers), and a proxy must never be able to take the pinned address
 * out of the loop.
 *
 * Real sockets on loopback, a self-signed certificate made per run, and a
 * black-hole UDP "nameserver". Nothing leaves the machine.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { createServer as createNetServer, type Server as NetServer } from 'node:net'
import { createSocket, type Socket } from 'node:dgram'
import { Resolver } from 'node:dns/promises'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import selfsigned from 'selfsigned'
import {
  AvatarFetchError,
  caresAvatarResolver,
  createHttpsAvatarTransport,
  fetchIdpAvatar,
  type AvatarTransport,
  type DnsResolverLike,
} from '../../src/core/auth/idp/avatar-fetch'
import { AVATAR_MAX_BYTES } from '../../src/core/users/avatar-image'
import { PNG_1X1 } from './avatar-fixtures'

let pems: { private: string; cert: string }

beforeAll(async () => {
  pems = await (selfsigned as unknown as {
    generate: (a: unknown[], o: unknown) => Promise<{ private: string; cert: string }>
  }).generate([{ name: 'commonName', value: 'pics.test' }], { keySize: 2048, algorithm: 'sha256', days: 2 })
})

async function listen(server: HttpsServer | NetServer): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return (server.address() as { port: number }).port
}

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err) {
    expect(err).toBeInstanceOf(AvatarFetchError)
    return (err as AvatarFetchError).reason
  }
  throw new Error('expected a refusal')
}

describe('sockets', () => {
  it('closes a non-200 response at once instead of draining a body that never ends', async () => {
    let closed = false
    const server = createHttpsServer({ key: pems.private, cert: pems.cert }, (_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' })
      const drip = setInterval(() => res.write('x'), 10)
      res.on('close', () => {
        clearInterval(drip)
        closed = true
      })
    })
    const port = await listen(server)
    try {
      const got = await createHttpsAvatarTransport({ ca: pems.cert })({
        url: new URL(`https://pics.test:${port}/a.png`),
        address: '127.0.0.1',
        family: 4,
        signal: AbortSignal.timeout(5_000),
        maxBytes: AVATAR_MAX_BYTES,
      })
      expect(got.status).toBe(404)
      // Well inside the 5 s budget: the transport hung up rather than read on.
      await vi.waitFor(() => expect(closed).toBe(true), { timeout: 1_000, interval: 20 })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it('aborts its request signal on every exit, not only on the deadline', async () => {
    let seen: AbortSignal | undefined
    const transport: AvatarTransport = async ({ signal }) => {
      seen = signal
      return { status: 404, body: Buffer.alloc(0) }
    }
    const reason = await reasonOf(
      fetchIdpAvatar('https://pics.example/a.png', {
        resolve: async () => [{ address: '93.184.216.34', family: 4 }],
        transport,
      }),
    )
    expect(reason).toBe('http_status')
    expect(seen?.aborted).toBe(true)
  })

  it('aborts after a success too, so nothing the transport opened can linger', async () => {
    let seen: AbortSignal | undefined
    const transport: AvatarTransport = async ({ signal }) => {
      seen = signal
      return { status: 200, body: PNG_1X1 }
    }
    await fetchIdpAvatar('https://pics.example/a.png', {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      transport,
    })
    expect(seen?.aborted).toBe(true)
  })
})

describe('DNS', () => {
  it('resolves through a cancellable resolver sized to the budget, and cancels it at the deadline', async () => {
    const pending: Array<(err: Error) => void> = []
    const cancel = vi.fn(() => {
      for (const reject of pending.splice(0)) reject(Object.assign(new Error('cancelled'), { code: 'ECANCELLED' }))
    })
    const hang = () => new Promise<string[]>((_, reject) => pending.push(reject))
    const factory = vi.fn((): DnsResolverLike => ({ resolve4: hang, resolve6: hang, cancel }))

    const started = Date.now()
    const reason = await reasonOf(
      fetchIdpAvatar('https://pics.example/a.png', {
        resolve: caresAvatarResolver(factory),
        transport: async () => ({ status: 200, body: PNG_1X1 }),
        timeoutMs: 50,
      }),
    )
    expect(reason).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(1_000)
    // One try, bounded by what is left of the budget — never the libuv pool.
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ tries: 1 }))
    expect(factory.mock.calls[0]![0].timeout).toBeLessThanOrEqual(50)
    // The outstanding queries were cancelled, not left running.
    expect(cancel).toHaveBeenCalled()
    expect(pending).toHaveLength(0)
  })

  it('merges A and AAAA answers and vets every one', async () => {
    const factory = (): DnsResolverLike => ({
      resolve4: async () => ['93.184.216.34'],
      resolve6: async () => ['fd00::1'],
      cancel: () => {},
    })
    const transport = vi.fn(async () => ({ status: 200, body: PNG_1X1 }))
    const reason = await reasonOf(
      fetchIdpAvatar('https://mixed.example/a.png', { resolve: caresAvatarResolver(factory), transport }),
    )
    expect(reason).toBe('blocked_address')
    expect(transport).not.toHaveBeenCalled()
  })

  it('succeeds with only one family answering', async () => {
    const factory = (): DnsResolverLike => ({
      resolve4: async () => ['93.184.216.34'],
      resolve6: async () => {
        throw Object.assign(new Error('no AAAA'), { code: 'ENODATA' })
      },
      cancel: () => {},
    })
    const transport = vi.fn(async () => ({ status: 200, body: PNG_1X1 }))
    await fetchIdpAvatar('https://v4only.example/a.png', { resolve: caresAvatarResolver(factory), transport })
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ address: '93.184.216.34', family: 4 }))
  })

  describe('a nameserver that drops AAAA queries', () => {
    /** A answers now; AAAA as scripted (never, by default), until cancelled. */
    function dropsAaaa(aaaa: { after?: number; answer?: string[]; fail?: boolean } = {}) {
      const pending: Array<(e: Error) => void> = []
      const cancel = vi.fn(() => {
        for (const r of pending.splice(0)) r(Object.assign(new Error('cancelled'), { code: 'ECANCELLED' }))
      })
      const resolve6 = () =>
        new Promise<string[]>((res, rej) => {
          pending.push(rej)
          if (aaaa.after !== undefined) {
            setTimeout(() => (aaaa.fail ? rej(new Error('ENODATA')) : res(aaaa.answer ?? [])), aaaa.after)
          }
        })
      return {
        cancel,
        factory: (): DnsResolverLike => ({ resolve4: async () => ['93.184.216.34'], resolve6, cancel }),
      }
    }

    it('proceeds on the A answer after a short grace instead of waiting out the budget', async () => {
      const { factory, cancel } = dropsAaaa()
      const transport = vi.fn(async () => ({ status: 200, body: PNG_1X1 }))
      const started = Date.now()
      const got = await fetchIdpAvatar('https://v4.example/a.png', {
        resolve: caresAvatarResolver(factory),
        transport,
        timeoutMs: 4_000,
      })
      expect(got.contentType).toBe('image/png')
      expect(Date.now() - started).toBeLessThan(1_500)
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ address: '93.184.216.34' }))
      // The abandoned AAAA query is cancelled, not left running.
      expect(cancel).toHaveBeenCalled()
    })

    it('still refuses the host when the AAAA answer arrives inside the grace and is blocked', async () => {
      const { factory } = dropsAaaa({ after: 50, answer: ['fd00::1'] })
      const transport = vi.fn(async () => ({ status: 200, body: PNG_1X1 }))
      const reason = await reasonOf(
        fetchIdpAvatar('https://mixed.example/a.png', { resolve: caresAvatarResolver(factory), transport, timeoutMs: 4_000 }),
      )
      expect(reason).toBe('blocked_address')
      expect(transport).not.toHaveBeenCalled()
    })

    it('waits the full budget for AAAA when A had no answer', async () => {
      const pending: Array<() => void> = []
      const factory = (): DnsResolverLike => ({
        resolve4: async () => {
          throw Object.assign(new Error('no A'), { code: 'ENODATA' })
        },
        resolve6: () => new Promise((res) => setTimeout(() => res(['2606:4700:4700::1111']), 600)),
        cancel: () => pending.forEach((p) => p()),
      })
      const transport = vi.fn(async () => ({ status: 200, body: PNG_1X1 }))
      await fetchIdpAvatar('https://v6.example/a.png', { resolve: caresAvatarResolver(factory), transport, timeoutMs: 4_000 })
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ address: '2606:4700:4700::1111', family: 6 }))
    })
  })

  describe('against a nameserver that never answers', () => {
    let blackHole: Socket
    let port = 0
    beforeAll(async () => {
      blackHole = createSocket('udp4')
      blackHole.on('message', () => {}) // swallow every query
      await new Promise<void>((r) => blackHole.bind(0, '127.0.0.1', r))
      port = blackHole.address().port
    })
    afterAll(() => new Promise<void>((r) => blackHole.close(() => r())))

    it('the real c-ares resolver gives up within the budget', async () => {
      const cancels: number[] = []
      const factory = (opts: { timeout: number; tries: number }): DnsResolverLike => {
        const r = new Resolver(opts)
        r.setServers([`127.0.0.1:${port}`])
        const cancel = r.cancel.bind(r)
        return {
          resolve4: (h) => r.resolve4(h),
          resolve6: (h) => r.resolve6(h),
          cancel: () => {
            cancels.push(Date.now())
            cancel()
          },
        }
      }
      const started = Date.now()
      const reason = await reasonOf(
        fetchIdpAvatar('https://pics.example/a.png', {
          resolve: caresAvatarResolver(factory),
          transport: async () => ({ status: 200, body: PNG_1X1 }),
          timeoutMs: 300,
        }),
      )
      expect(['timeout', 'dns']).toContain(reason)
      expect(Date.now() - started).toBeLessThan(2_000)
    })
  })
})

describe('proxy environment', () => {
  it('never hands the connection to an env-configured proxy: the pinned address is dialled directly', async () => {
    // A "proxy" that records whatever reaches it.
    const proxyBytes: string[] = []
    const proxy = createNetServer((sock) => {
      sock.on('data', (d) => {
        proxyBytes.push(d.toString('latin1'))
        sock.destroy()
      })
    })
    const proxyPort = await listen(proxy)
    // The real destination, only reachable through the pin: `pics.test`
    // (a reserved TLD) resolves nowhere.
    let servedTo = ''
    const target = createHttpsServer({ key: pems.private, cert: pems.cert }, (req, res) => {
      servedTo = String(req.headers.host)
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(PNG_1X1)
    })
    const targetPort = await listen(target)

    const dir = mkdtempSync(join(tmpdir(), 'avatar-proxy-'))
    const certPath = join(dir, 'cert.pem')
    writeFileSync(certPath, pems.cert)
    const script = join(dir, 'run.ts')
    const modulePath = resolve(__dirname, '../../src/core/auth/idp/avatar-fetch.ts')
    writeFileSync(
      script,
      `import { readFileSync } from 'node:fs'
import { createHttpsAvatarTransport } from ${JSON.stringify(modulePath)}
const transport = createHttpsAvatarTransport({ ca: readFileSync(${JSON.stringify(certPath)}, 'utf8') })
transport({
  url: new URL('https://pics.test:${targetPort}/a.png'),
  address: '127.0.0.1',
  family: 4,
  signal: AbortSignal.timeout(4000),
  maxBytes: 524288,
}).then(
  (r) => { process.stdout.write(JSON.stringify({ status: r.status, bytes: r.body.length })) },
  (e) => { process.stdout.write(JSON.stringify({ error: String(e && e.code || e) })) },
)
`,
    )
    try {
      const out = await new Promise<string>((done, fail) => {
        const child = spawn(process.execPath, ['--import', 'tsx', script], {
          cwd: resolve(__dirname, '../..'),
          env: {
            ...process.env,
            NODE_USE_ENV_PROXY: '1',
            HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
            https_proxy: `http://127.0.0.1:${proxyPort}`,
            NO_PROXY: '',
            no_proxy: '',
          },
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        child.on('error', fail)
        child.on('close', () => (stdout ? done(stdout) : fail(new Error(stderr || 'no output'))))
      })
      expect(proxyBytes.join('')).not.toContain('CONNECT')
      expect(proxyBytes).toEqual([])
      expect(JSON.parse(out)).toEqual({ status: 200, bytes: PNG_1X1.length })
      expect(servedTo).toBe(`pics.test:${targetPort}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      target.closeAllConnections()
      await new Promise<void>((r) => target.close(() => r()))
      await new Promise<void>((r) => proxy.close(() => r()))
    }
  }, 20_000)
})
