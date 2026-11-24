/** A fresh opaque id. Ids carry no meaning; node numbers are derived from tree position. */
export function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
