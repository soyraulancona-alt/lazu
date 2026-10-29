import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Contraseña temporal de 14 caracteres para un usuario nuevo. */
export function temporaryPassword(): string {
  return Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
