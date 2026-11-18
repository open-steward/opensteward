/**
 * A minimal XML reader for the bpost web services.
 *
 * Every bpost API this adapter reads answers in XML: the Shipping Manager
 * ("Web Services offered by the Shipping Manager are then implemented by
 * sending and/or receiving XML documents over the HTTP(s) Protocol", bpack
 * integration manual v3.3.35 §C.3.2.2) and the trackingInfo web service
 * ("XML < itemTracking /> element", §E.3.4.2). The documents are small and
 * element-oriented, so this reads them into a plain tree rather than pulling
 * in a parser dependency.
 *
 * Namespace prefixes are dropped from element and attribute names: the
 * documented responses mix unprefixed and `ns2:`/`ns3:` elements (see the
 * Retrieve Order and trackingInfo examples), and the local name is what the
 * manual's tables name.
 */

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
    return ENTITIES[ref] ?? whole
  })
}

function localName(qualified: string): string {
  const i = qualified.indexOf(':')
  return i === -1 ? qualified : qualified.slice(i + 1)
}

const NAME = /[^\s=/>'"]+/y
const SPACE = /\s*/y

function matchAt(re: RegExp, xml: string, at: number): string {
  re.lastIndex = at
  return re.exec(xml)?.[0] ?? ''
}

/**
 * Read the start tag that opens at `lt`: its name, attributes and whether it
 * closes itself. A quoted attribute value may contain '>'. Anything other than
 * whitespace-separated name="value" / name='value' pairs (for example an
 * unescaped quote inside a value) is an error, never a silent truncation.
 */
function readStartTag(
  xml: string,
  lt: number,
): { name: string; attrs: Record<string, string>; selfClosing: boolean; end: number } {
  let j = lt + 1
  const name = matchAt(NAME, xml, j)
  if (!name) throw new Error('bpost: malformed tag in XML response')
  j += name.length
  const attrs: Record<string, string> = {}
  for (;;) {
    const space = matchAt(SPACE, xml, j)
    j += space.length
    if (j >= xml.length) throw new Error('bpost: unterminated tag in XML response')
    if (xml[j] === '>') return { name: localName(name), attrs, selfClosing: false, end: j + 1 }
    if (xml.startsWith('/>', j)) {
      return { name: localName(name), attrs, selfClosing: true, end: j + 2 }
    }
    const attrName = matchAt(NAME, xml, j)
    if (!attrName || !space) throw new Error('bpost: malformed attribute in XML response')
    j += attrName.length
    j += matchAt(SPACE, xml, j).length
    if (xml[j] !== '=') throw new Error('bpost: malformed attribute in XML response')
    j += 1
    j += matchAt(SPACE, xml, j).length
    const quote = xml[j]
    if (quote !== '"' && quote !== "'") {
      throw new Error('bpost: malformed attribute in XML response')
    }
    const close = xml.indexOf(quote, j + 1)
    if (close === -1) throw new Error('bpost: unterminated tag in XML response')
    if (attrName !== 'xmlns' && !attrName.startsWith('xmlns:')) {
      attrs[localName(attrName)] = decode(xml.slice(j + 1, close))
    }
    // The next attribute must be preceded by whitespace (checked at the loop head).
    j = close + 1
  }
}

/** The index just past the next `token` at or after `from`; throws when there is none. */
function after(xml: string, token: string, from: number): number {
  const at = xml.indexOf(token, from)
  if (at === -1) throw new Error('bpost: malformed XML response')
  return at + token.length
}

/** Parse an XML document and return its root element. Throws on a malformed document. */
export function parseXml(xml: string): XmlNode {
  if (typeof xml !== 'string') throw new Error('bpost: expected an XML document')
  const stack: XmlNode[] = []
  let root: XmlNode | undefined
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    const textEnd = lt === -1 ? xml.length : lt
    if (textEnd > i && stack.length) stack[stack.length - 1]!.text += decode(xml.slice(i, textEnd))
    if (lt === -1) break
    if (xml.startsWith('<?', lt)) {
      i = after(xml, '?>', lt)
    } else if (xml.startsWith('<!--', lt)) {
      i = after(xml, '-->', lt)
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt)
      if (end === -1) throw new Error('bpost: unterminated CDATA in XML response')
      if (stack.length) stack[stack.length - 1]!.text += xml.slice(lt + 9, end)
      i = end + 3
    } else if (xml.startsWith('<!', lt)) {
      i = after(xml, '>', lt)
    } else if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt)
      if (end === -1) throw new Error('bpost: unterminated closing tag in XML response')
      const name = localName(xml.slice(lt + 2, end).trim())
      const open = stack.pop()
      if (!open || open.name !== name) {
        throw new Error(`bpost: mismatched closing tag </${name}> in XML response`)
      }
      if (!stack.length) root = open
      i = end + 1
    } else {
      const tag = readStartTag(xml, lt)
      const node: XmlNode = { name: tag.name, attrs: tag.attrs, children: [], text: '' }
      if (stack.length) stack[stack.length - 1]!.children.push(node)
      if (tag.selfClosing) {
        if (!stack.length) root = node
      } else {
        stack.push(node)
      }
      i = tag.end
    }
  }
  if (stack.length || !root) throw new Error('bpost: incomplete XML response')
  return root
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : []
}

export function childNamed(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name)
}

/** Trimmed text of the first child with this name; undefined when absent or empty. */
export function childText(node: XmlNode | undefined, name: string): string | undefined {
  const text = childNamed(node, name)?.text.trim()
  return text ? text : undefined
}

/** Assert the document's root element, so a wrong body is an error rather than an empty result. */
export function expectRoot(node: XmlNode, name: string): XmlNode {
  if (node.name !== name) {
    throw new Error(`bpost: expected a <${name}> response, got <${node.name}>`)
  }
  return node
}
