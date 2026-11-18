import { describe, it, expect } from 'vitest'
import {
  childText,
  childrenNamed,
  parseXml,
} from '../../../../../../src/verticals/logistics/adapters/bpost/xml'

describe('bpost parseXml', () => {
  it('drops namespace prefixes and declarations, keeping local names', () => {
    const root = parseXml(
      '<?xml version="1.0"?><a:root xmlns:a="urn:x" a:id="7"><a:item>one</a:item><item>two</item></a:root>',
    )
    expect(root.name).toBe('root')
    expect(root.attrs).toEqual({ id: '7' })
    expect(childrenNamed(root, 'item').map((n) => n.text)).toEqual(['one', 'two'])
  })

  it('decodes entities in text and attributes, and reads CDATA verbatim', () => {
    const root = parseXml(
      '<r n="Info &quot;Next Day&quot;"><t>a &amp; b &#233; &#x41;</t><c><![CDATA[<raw & text>]]></c></r>',
    )
    expect(root.attrs['n']).toBe('Info "Next Day"')
    expect(childText(root, 't')).toBe('a & b é A')
    expect(childText(root, 'c')).toBe('<raw & text>')
  })

  it("reads a '>' inside a quoted attribute value as part of the value", () => {
    const root = parseXml('<r a="1>2" b=\'x\'><c/></r>')
    expect(root.attrs).toEqual({ a: '1>2', b: 'x' })
    expect(root.children.map((c) => c.name)).toEqual(['c'])
  })

  it('reads a self-closing root and skips comments', () => {
    expect(parseXml('<!-- note --><options/>').name).toBe('options')
  })

  it.each([
    ['a mismatched closing tag', '<a><b></a></b>', /mismatched closing tag/],
    ['an unclosed element', '<a><b></b>', /incomplete XML/],
    ['an element left open after the root', '<a/><b>', /incomplete XML/],
    ['an unterminated tag', '<a><b', /unterminated tag/],
    ['an unterminated declaration', '<?xml version="1.0"', /malformed XML/],
    ['an empty body', '', /incomplete XML/],
    // The SHM v5 productconfig doc example's own defect: name="Info "Next Day"".
    [
      'an unescaped quote inside an attribute value',
      '<o name="Info "Next Day"" price="1"/>',
      /malformed attribute/,
    ],
    ['attributes with no whitespace between them', '<o a="1"b="2"/>', /malformed attribute/],
    ['an unquoted attribute value', '<o a=1/>', /malformed attribute/],
    ['an unterminated attribute value', '<o a="1/>', /unterminated tag/],
  ])('throws on %s', (_label, xml, message) => {
    expect(() => parseXml(xml)).toThrow(message)
  })
})
