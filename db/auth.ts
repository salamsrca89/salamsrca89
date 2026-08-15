export const INITIAL_PASSWORD = "997";
export const SESSION_COOKIE = "alsalam_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;
const LEGACY_PBKDF2_ITERATIONS = 210_000;
export const INITIAL_PASSWORD_CREDENTIALS = {
  hash: "sAKJKPIUnwlRgzlB+Xi4iR/ubtZT/450gMdw7C0Hxlo=",
  salt: "AAECAwQFBgcICQoLDA0ODw==",
  iterations: PBKDF2_ITERATIONS,
} as const;

function toBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function fromBase64(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array) {
  return toBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function normalizeUsername(value: string) {
  return value.trim().toUpperCase();
}

async function derivePassword(password: string, salt: string, iterations: number) {
  const saltBytes = fromBase64(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function hashPassword(password: string, salt?: string, iterations = PBKDF2_ITERATIONS) {
  const saltBytes = salt ? fromBase64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const resolvedSalt = salt ?? toBase64(saltBytes);
  return {
    hash: await derivePassword(password, resolvedSalt, iterations),
    salt: resolvedSalt,
    iterations,
  };
}

function hashesMatch(hash: string, expectedHash: string) {
  if (hash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < hash.length; index += 1) {
    difference |= hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
  storedIterations?: number | null,
) {
  if (storedIterations) {
    return hashesMatch(
      await derivePassword(password, salt, storedIterations),
      expectedHash,
    );
  }
  const currentHash = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  if (hashesMatch(currentHash, expectedHash)) return true;
  const legacyHash = await derivePassword(password, salt, LEGACY_PBKDF2_ITERATIONS);
  return hashesMatch(legacyHash, expectedHash);
}

export function createSessionToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64Url(new Uint8Array(digest));
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return "";
}

export function sessionCookie(request: Request, token: string, maxAge = SESSION_DURATION_SECONDS) {
  const hostname = new URL(request.url).hostname;
  const secure = hostname !== "localhost" && hostname !== "terminal.local";
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}
