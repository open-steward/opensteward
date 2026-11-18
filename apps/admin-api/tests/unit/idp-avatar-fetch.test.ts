/**
 * The SSRF guard around fetching an IdP's picture URL.
 *
 * DNS and the HTTP transport are both stubbed: nothing here touches the
 * network. The assertions that matter are the refusals — and that a refused
 * URL never reaches the transport at all.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  AvatarFetchError,
  fetchIdpAvatar,
  httpsAvatarTransport,
  isBlockedAddress,
  type AvatarResolver,
  type AvatarTransport,
} from '../../src/core/auth/idp/avatar-fetch'
import { AVATAR_MAX_BYTES } from '../../src/core/users/avatar-image'
import { JPEG, PNG_1X1, SVG, pngOfSize } from './avatar-fixtures'

const PUBLIC = { address: '93.184.216.34', family: 4 }

function resolverOf(...addresses: string[]): AvatarResolver {
  return async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
}

function transportOf(status: number, body: Buffer): AvatarTransport & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ status, body })) as never
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

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.251', // multicast
    '239.255.255.250',
    '255.255.255.255',
    '240.0.0.1',
    '198.18.0.1',
    '192.0.2.1',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1', // multicast
    '::ffff:127.0.0.1',
    '::ffff:7f00:1', // the same, hex-mapped — what a URL parser normalises to
    '::ffff:a9fe:a9fe', // 169.254.169.254, hex-mapped
    '64:ff9b::a00:1', // NAT64 → 10.0.0.1
    '2001:db8::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  // Global IPv6 is allowed only inside 2000::/3, and within it the prefixes
  // that tunnel or translate to an IPv4 destination are refused outright —
  // even when the IPv4 address they carry is public, because the far end of
  // a tunnel or translator is not something this check can see.
  it.each([
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo 2001::/32'],
    ['2001:db8:85a3::8a2e:370:7334', 'documentation 2001:db8::/32'],
    ['2002:c000:204::1', '6to4 2002::/16'],
    ['2002:5db8:d822::1', '6to4 carrying a public IPv4'],
    ['64:ff9b:1::1', 'local-use NAT64 64:ff9b:1::/48'],
    ['64:ff9b:1::5db8:d822', 'local-use NAT64 even carrying a public IPv4'],
    ['64:ff9b::7f00:1', 'DNS64 of loopback'],
    ['64:ff9b::a9fe:a9fe', 'DNS64 of cloud metadata'],
    ['64:ff9b::c0a8:101', 'DNS64 of 192.168.1.1'],
    ['64:ff9b::e000:fb', 'DNS64 of multicast 224.0.0.251'],
    ['64:ff9b:0:0:1::808:808', '64:ff9b::/64 but outside the /96'],
    ['::ffff:93.184.216.34', 'IPv4-mapped ::ffff:0:0/96, even of a public address'],
    ['::ffff:0:5db8:d822', 'SIIT ::ffff:0:0:0/96'],
    ['4000::1', 'outside 2000::/3'],
    ['100::1', 'discard-only 100::/64'],
    ['192.88.99.1', '6to4 relay anycast 192.88.99.0/24'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  // DNS64 (RFC 6147) synthesises AAAA records in 64:ff9b::/96 for IPv4-only
  // hosts on IPv6-only networks: allowed exactly when the IPv4 is public.
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '64:ff9b::808:808', '64:ff9b::5db8:d822', '64:ff9b::93.184.216.34'])(
    'allows public %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false)
    },
  )
})

describe('fetchIdpAvatar', () => {
  it('fetches over https from the vetted address and sniffs the type', async () => {
    const transport = transportOf(200, JPEG)
    const got = await fetchIdpAvatar('https://pics.example/u/1?sig=secret', {
      resolve: resolverOf(PUBLIC.address),
      transport,
    })
    expect(got.contentType).toBe('image/jpeg')
    expect(Buffer.compare(got.bytes, JPEG)).toBe(0)
    // The connection is pinned to the address that passed the check.
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ address: PUBLIC.address, family: 4, maxBytes: AVATAR_MAX_BYTES }),
    )
  })

  it('refuses http, a non-default port and credentials without touching the network', async () => {
    const transport = transportOf(200, PNG_1X1)
    const resolve = vi.fn(resolverOf(PUBLIC.address))
    const o = { resolve, transport }
    expect(await reasonOf(fetchIdpAvatar('http://pics.example/a.png', o))).toBe('not_https')
    expect(await reasonOf(fetchIdpAvatar('https://pics.example:8443/a.png', o))).toBe('blocked_port')
    expect(await reasonOf(fetchIdpAvatar('https://u:p@pics.example/a.png', o))).toBe('invalid_url')
    expect(await reasonOf(fetchIdpAvatar('javascript:alert(1)', o))).toBe('not_https')
    expect(await reasonOf(fetchIdpAvatar('not a url', o))).toBe('invalid_url')
    expect(resolve).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })

  it('refuses a private IP literal, v4 or v6', async () => {
    const transport = transportOf(200, PNG_1X1)
    for (const url of [
      'https://10.0.0.5/a.png',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a.png',
      'https://[::ffff:127.0.0.1]/a.png',
    ]) {
      expect(await reasonOf(fetchIdpAvatar(url, { transport }))).toBe('blocked_address')
    }
    expect(transport).not.toHaveBeenCalled()
  })

  it('refuses a hostname that resolves to a private address — or to any private address among several', async () => {
    const transport = transportOf(200, PNG_1X1)
    expect(
      await reasonOf(fetchIdpAvatar('https://evil.example/a.png', { resolve: resolverOf('192.168.0.10'), transport })),
    ).toBe('blocked_address')
    expect(
      await reasonOf(
        fetchIdpAvatar('https://mixed.example/a.png', {
          resolve: resolverOf(PUBLIC.address, '127.0.0.1'),
          transport,
        }),
      ),
    ).toBe('blocked_address')
    expect(
      await reasonOf(fetchIdpAvatar('https://mc.example/a.png', { resolve: resolverOf('ff05::c'), transport })),
    ).toBe('blocked_address')
    expect(transport).not.toHaveBeenCalled()
  })

  it('fails closed on a name that does not resolve', async () => {
    const transport = transportOf(200, PNG_1X1)
    expect(await reasonOf(fetchIdpAvatar('https://nx.example/a.png', { resolve: resolverOf(), transport }))).toBe('dns')
    const throwing: AvatarResolver = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(await reasonOf(fetchIdpAvatar('https://nx.example/a.png', { resolve: throwing, transport }))).toBe('dns')
  })

  it('does not follow a redirect', async () => {
    const reason = await reasonOf(
      fetchIdpAvatar('https://pics.example/a.png', {
        resolve: resolverOf(PUBLIC.address),
        transport: transportOf(302, Buffer.alloc(0)),
      }),
    )
    expect(reason).toBe('redirect')
  })

  it('refuses a non-200 answer', async () => {
    const reason = await reasonOf(
      fetchIdpAvatar('https://pics.example/a.png', {
        resolve: resolverOf(PUBLIC.address),
        transport: transportOf(404, Buffer.from('nope')),
      }),
    )
    expect(reason).toBe('http_status')
  })

  it('refuses a body that is not a PNG, JPEG or WebP — HTML and SVG included', async () => {
    for (const body of [Buffer.from('<!doctype html><title>login</title>'), SVG]) {
      const reason = await reasonOf(
        fetchIdpAvatar('https://pics.example/a', {
          resolve: resolverOf(PUBLIC.address),
          transport: transportOf(200, body),
        }),
      )
      expect(reason).toBe('not_image')
    }
  })

  it('refuses a body over 512 KB', async () => {
    const reason = await reasonOf(
      fetchIdpAvatar('https://pics.example/big.png', {
        resolve: resolverOf(PUBLIC.address),
        transport: transportOf(200, pngOfSize(AVATAR_MAX_BYTES + 1)),
      }),
    )
    expect(reason).toBe('too_large')
  })

  it('gives up at the deadline and aborts the request', async () => {
    let aborted = false
    const hanging: AvatarTransport = ({ signal }) =>
      new Promise(() => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
      })
    const started = Date.now()
    const reason = await reasonOf(
      fetchIdpAvatar('https://slow.example/a.png', {
        resolve: resolverOf(PUBLIC.address),
        transport: hanging,
        timeoutMs: 50,
      }),
    )
    expect(reason).toBe('timeout')
    expect(aborted).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('the real transport dials the vetted address, not a fresh DNS answer, and keeps SNI on the hostname', async () => {
    // A bare TCP listener on loopback stands in for "wherever the vetted
    // address points". The URL's hostname does not resolve at all
    // (`.invalid`), so a connection arriving here proves the socket was
    // pinned; the ClientHello names the hostname in SNI, in plaintext.
    const { createServer } = await import('node:net')
    let hello = ''
    const server = createServer((socket) => {
      socket.once('data', (chunk) => {
        hello = chunk.toString('latin1')
        socket.destroy()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    try {
      await expect(
        httpsAvatarTransport({
          url: new URL(`https://pics.invalid:${port}/a.png`),
          address: '127.0.0.1',
          family: 4,
          signal: AbortSignal.timeout(2_000),
          maxBytes: AVATAR_MAX_BYTES,
        }),
      ).rejects.toThrow()
      expect(hello).toContain('pics.invalid')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('counts slow DNS against the same deadline', async () => {
    const slowDns: AvatarResolver = () => new Promise(() => {})
    const reason = await reasonOf(
      fetchIdpAvatar('https://slow.example/a.png', {
        resolve: slowDns,
        transport: transportOf(200, PNG_1X1),
        timeoutMs: 50,
      }),
    )
    expect(reason).toBe('timeout')
  })
})
