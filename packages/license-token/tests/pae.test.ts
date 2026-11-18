import { describe, expect, it } from 'vitest'
import { le64, pae } from '../src/pae'

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const utf8 = (s: string) => new TextEncoder().encode(s)

describe('PAE (PASETO Common.md test cases)', () => {
  it('PAE([]) is LE64(0)', () => expect(hex(pae([]))).toBe('0000000000000000'))
  it("PAE(['']) is LE64(1) || LE64(0)", () =>
    expect(hex(pae([utf8('')]))).toBe('0100000000000000' + '0000000000000000'))
  it("PAE(['test']) is LE64(1) || LE64(4) || 'test'", () =>
    expect(hex(pae([utf8('test')]))).toBe('0100000000000000' + '0400000000000000' + '74657374'))
  it('LE64 is little-endian', () => expect(hex(le64(0x0102030405))).toBe('0504030201000000'))
  it('LE64 refuses negative, fractional and unsafe lengths', () => {
    for (const n of [-1, 1.5, 2 ** 53]) expect(() => le64(n)).toThrow(RangeError)
  })
  it('frames pieces independently (no concatenation ambiguity)', () =>
    expect(hex(pae([utf8('ab'), utf8('c')]))).not.toBe(hex(pae([utf8('a'), utf8('bc')]))))
})
