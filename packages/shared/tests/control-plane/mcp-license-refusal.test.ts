import { describe, expect, it } from 'vitest'
import { refuseIfMcpDisabled, type McpRefusal } from '../../src/control-plane/mcp-guards'

function makeReply() {
  const res: { statusCode?: number; body?: unknown } = {}
  const reply = {
    status(code: number) {
      res.statusCode = code
      return reply
    },
    send(body: unknown) {
      res.body = body
      return reply
    },
  }
  return { reply: reply as never, res }
}

describe('refuseIfMcpDisabled with a license-aware source (P10)', () => {
  it('sends a source refusal verbatim', async () => {
    const { reply, res } = makeReply()
    const refusal: McpRefusal = { code: 'LICENSE_FEATURE_NOT_ENTITLED', message: 'no mcp' }
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], () => refusal)).toBe(true)
    expect(res).toEqual({ statusCode: 403, body: { error: refusal } })
  })
  it('sends only the code and message of a refusal, never extra fields', async () => {
    const { reply, res } = makeReply()
    const refusal = {
      code: 'LICENSE_FEATURE_NOT_ENTITLED',
      message: 'no mcp',
      token: 'v4.public.x',
    }
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], () => refusal)).toBe(true)
    expect(res).toEqual({
      statusCode: 403,
      body: { error: { code: 'LICENSE_FEATURE_NOT_ENTITLED', message: 'no mcp' } },
    })
  })
  it('keeps MCP_DISABLED for a plain false (the runtime setting)', async () => {
    const { reply, res } = makeReply()
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], () => false)).toBe(true)
    expect(res).toMatchObject({ statusCode: 403, body: { error: { code: 'MCP_DISABLED' } } })
  })
  // An untyped JS source, or a cast, can hand back anything. It must still be a
  // clean 403 envelope, never a TypeError that surfaces as a 500 (review m18).
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'no'],
    ['a number', 0],
    ['an object without code/message', {}],
    ['an object with a non-string code', { code: 7, message: 'm' }],
  ])('refuses %s as MCP_DISABLED instead of throwing', async (_label, verdict) => {
    const { reply, res } = makeReply()
    const source = (() => verdict) as unknown as () => boolean
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], source)).toBe(true)
    expect(res).toMatchObject({ statusCode: 403, body: { error: { code: 'MCP_DISABLED' } } })
  })
  it('true lets it through', async () => {
    const { reply, res } = makeReply()
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], () => true)).toBe(false)
    expect(res).toEqual({})
  })
  it('no source lets it through', async () => {
    const { reply, res } = makeReply()
    expect(await refuseIfMcpDisabled(reply, ['mcp:read'], undefined)).toBe(false)
    expect(res).toEqual({})
  })
  it('ignores the source for non-MCP principals', async () => {
    const { reply, res } = makeReply()
    expect(await refuseIfMcpDisabled(reply, ['*'], () => ({ code: 'X', message: 'y' }))).toBe(false)
    expect(res).toEqual({})
  })
})
