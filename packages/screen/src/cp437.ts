/**
 * IBM code page 437, the character set of the DOS text screen, as Unicode.
 * Bytes 0x00-0x1F and 0x7F are the screen glyphs (smileys, arrows), not control codes, because on a
 * text-mode screen every byte is drawn. Byte 0x00 is drawn blank; it maps to U+2400 (␀) rather than a
 * space, so the table stays one-to-one and every byte string round-trips.
 */
const LOW = '␀☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼';
const HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
  '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0';

let ascii = '';
for (let b = 0x20; b < 0x7f; b++) ascii += String.fromCharCode(b);

/** CP437[byte] is the Unicode character DOS draws for that byte. */
export const CP437: readonly string[] = [...LOW, ...ascii, '⌂', ...HIGH];

const REVERSE = new Map(CP437.map((ch, byte) => [ch, byte]));

export function cp437ToUnicode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += CP437[b];
  return s;
}

export function unicodeToCp437(text: string): Uint8Array {
  const chars = [...text];
  const out = new Uint8Array(chars.length);
  chars.forEach((ch, i) => {
    const b = REVERSE.get(ch);
    if (b === undefined) throw new Error(`Not a CP437 character: ${JSON.stringify(ch)}`);
    out[i] = b;
  });
  return out;
}
