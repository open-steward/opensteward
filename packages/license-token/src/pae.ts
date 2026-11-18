/** LE64 with the most significant bit cleared (PASETO Common.md, PAE). */
export function le64(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`le64: ${n} is not a non-negative safe integer`)
  }
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, BigInt(n) & 0x7fff_ffff_ffff_ffffn, true)
  return out
}

/** Pre-Authentication Encoding: LE64(count) || for each piece LE64(length) || piece. */
export function pae(pieces: readonly Uint8Array[]): Uint8Array {
  let size = 8
  for (const piece of pieces) size += 8 + piece.byteLength
  const out = new Uint8Array(size)
  out.set(le64(pieces.length), 0)
  let offset = 8
  for (const piece of pieces) {
    out.set(le64(piece.byteLength), offset)
    offset += 8
    out.set(piece, offset)
    offset += piece.byteLength
  }
  return out
}
