import { randomInt } from "node:crypto";

// Sin caracteres ambiguos (0/o, 1/l/i) para que se puedan dictar o teclear.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const CARD_CODE_LENGTH = 8;
export const CARD_CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

/** Código aleatorio criptográfico: 31^8 ≈ 8.5 × 10^11 combinaciones. */
export function generateCardCode(): string {
  let code = "";
  for (let i = 0; i < CARD_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isCardCode(value: string): boolean {
  return CARD_CODE_RE.test(value);
}

/** Enlaces que se graban en la tarjeta: el chip NFC y el QR llevan la misma tarjeta, con un marcador para distinguirlos. */
export function cardUrls(baseUrl: string, code: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return { nfc: `${base}/c/${code}`, qr: `${base}/c/${code}?v=qr` };
}
