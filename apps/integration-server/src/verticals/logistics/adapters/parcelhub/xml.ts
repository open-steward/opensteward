/**
 * Minimal XML reader and writer for the Parcelhub APIs.
 *
 * Both first-party APIs speak XML only. The Shipping API reference
 * (https://api.parcelhub.net/docs/shippingAPI/get-shipment/) declares every
 * response as `application/xml`, and the Tracking API introduction
 * (https://api.parcelhub.net/docs/trackingAPI/tracking-api/) says: "All requests
 * sent to the API require Content-Type in the header. The following content
 * type is supported by the API - text/xml - application/xml".
 *
 * The documents are small and flat, so this reader keeps only what the
 * transforms need: element names without namespace prefixes, attributes, and
 * text content. Values stay strings; `ParcelhubShipmentId` is an int64
 * (e.g. 12667473463631775) that a JS number would round.
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

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent.startsWith('#x')) return String.fromCodePoint(parseInt(ent.slice(2), 16))
    if (ent.startsWith('#')) return String.fromCodePoint(parseInt(ent.slice(1), 10))
    return ENTITIES[ent] ?? m
  })
}

function localName(qname: string): string {
  const i = qname.indexOf(':')
  return i === -1 ? qname : qname.slice(i + 1)
}

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const name = m[1] as string
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue
    attrs[localName(name)] = decodeEntities(m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Parse an XML document and return its root element. Throws on malformed input. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  const re =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const top = stack[stack.length - 1] as XmlNode
    if (m[1] !== undefined) {
      top.text += m[1]
    } else if (m[2] !== undefined) {
      const name = localName(m[2])
      if (top.name !== name || stack.length === 1) {
        throw new Error(`Malformed XML: unexpected </${m[2]}>`)
      }
      stack.pop()
    } else if (m[3] !== undefined) {
      const node: XmlNode = {
        name: localName(m[3]),
        attrs: parseAttrs(m[4] ?? ''),
        children: [],
        text: '',
      }
      top.children.push(node)
      if (m[5] !== '/') stack.push(node)
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6])
    }
  }
  if (stack.length !== 1) throw new Error('Malformed XML: unclosed element')
  const doc = root.children[0]
  if (!doc) throw new Error('Malformed XML: no root element')
  return doc
}

/** First child element with this name. */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name)
}

/** All child elements with this name. */
export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? []
}

/** Trimmed text of the named child, or undefined when absent, empty or `xsi:nil`. */
export function textOf(node: XmlNode | undefined, name: string): string | undefined {
  const c = child(node, name)
  if (!c || c.attrs['nil'] === 'true') return undefined
  const t = c.text.trim()
  return t === '' ? undefined : t
}

/** Escape a value for use as XML element text. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Parse a timestamp only when it names its own offset. Parcelhub's examples
 * carry none (`2025-03-26T14:36:56.073`, `2025-04-08T09:21:48`) and the docs
 * never say which zone they are in, so a bare local time is not converted.
 */
export function parseZonedTimestamp(value: string | undefined): Date | undefined {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return undefined
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d
}
