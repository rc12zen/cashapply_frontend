/**
 * lib/crypto/envelope.ts
 * =======================
 * The browser half of API payload encryption. Byte-compatible with the
 * backend's app/common/crypto/envelope.py -- read that file's header for the
 * full rationale behind the format, the key fingerprint, and why the auth tag
 * is left appended to the ciphertext.
 *
 * FORMAT -- one opaque base64 string in a single-field object:
 *
 *     {"d": "AVZqU3fQ9yUXv9EoMNbTKTDkc+pfkQNh4ce7Dt2b7dwdUJhfIA=="}
 *
 * After base64-decoding, a fixed 17-byte header then the ciphertext:
 *
 *     offset  size  meaning
 *     ------  ----  --------------------------------------------------------
 *        0      1   format version (currently 1)
 *        1      4   key fingerprint -- which key sealed this
 *        5     12   iv / nonce, fresh random per message
 *       17    rest  AES-256-GCM ciphertext with its 16-byte auth tag appended
 *
 * Deliberately knows nothing about axios, HTTP, or this app's endpoints. It
 * converts between strings and envelopes, nothing more. api.ts wires it in via
 * interceptors, so axios stays purely a transport concern and the crypto stays
 * independently testable.
 *
 * WHY NATIVE WebCrypto AND NOT A LIBRARY
 * --------------------------------------
 * crypto.subtle is built into every browser, is implemented in native code,
 * and adds nothing to the bundle. It also refuses to run outside a secure
 * context (HTTPS, or localhost) -- which is a feature here: it makes it
 * impossible to accidentally ship this over plain HTTP and believe the
 * payloads are protected.
 *
 * WebCrypto's AES-GCM defaults to a 128-bit tag, which is exactly what
 * Python's cryptography library produces, so neither side needs to configure a
 * tag length for the two to interoperate.
 *
 * ON THE KEY BEING IN THIS BUNDLE
 * -------------------------------
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
 * the key below is readable by anyone who loads the app. That is inherent to a
 * shared-static-key design, not an oversight. Note especially that the compact
 * opaque format is NOT what protects anything -- the algorithm is visible in
 * this very file, so a reader of a captured payload can also read exactly how
 * it was made. Security rests entirely on the key. The upgrade path is a
 * per-session key negotiated at login, which needs no change to this file's
 * format -- only to where the key comes from.
 */

const FORMAT_VERSION = 1;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const FINGERPRINT_BYTES = 4;
const HEADER_BYTES = 1 + FINGERPRINT_BYTES + IV_BYTES;
const TAG_BYTES = 16;

/** The single, deliberately meaningless field carrying everything. */
const FIELD = "d";

const KEY_B64 = (process.env.NEXT_PUBLIC_API_ENCRYPTION_KEY ?? "").trim();

/**
 * Whether this build will encrypt. Driven purely by whether a key was supplied
 * at build time, which mirrors the backend's default (on unless APP_ENV=local)
 * without needing a second flag that could disagree with it.
 */
export const encryptionEnabled: boolean = KEY_B64.length > 0;

export type Envelope = { d: string };

function subtle(): SubtleCrypto {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!c?.subtle) {
    // Overwhelmingly means the page is being served over plain HTTP from a
    // non-localhost host, where browsers withhold crypto.subtle entirely. Said
    // explicitly, because the default failure is an opaque "cannot read
    // properties of undefined".
    throw new Error(
      "Web Crypto is unavailable. API payload encryption requires a secure " +
        "context — serve the app over HTTPS (localhost is also treated as secure)."
    );
  }
  return c.subtle;
}

/**
 * Byte buffers are spelled with this alias, never as bare `Uint8Array`.
 *
 * Since TypeScript 5.7 the typed arrays are generic over their backing buffer,
 * and plain `Uint8Array` means `Uint8Array<ArrayBufferLike>` — which does NOT
 * satisfy WebCrypto's `BufferSource`, because that requires the `ArrayBuffer`
 * variant specifically (`ArrayBufferLike` also admits `SharedArrayBuffer`).
 * Writing `Uint8Array` as a return type or variable annotation silently widens
 * an otherwise-correct value and fails at the subtle.* call site rather than
 * where the annotation is, which is why the alias is used consistently instead
 * of relying on inference in some places and annotations in others.
 */
type Bytes = Uint8Array<ArrayBuffer>;

// Constructed over an explicit ArrayBuffer so the result is Bytes, not the
// wider ArrayBufferLike form that `new Uint8Array(n)` alone produces.
function base64ToBytes(b64: string): Bytes {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Built one char at a time rather than via String.fromCharCode(...bytes):
  // spreading a large payload into apply() overflows the call stack on real
  // response sizes.
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decode an envelope's packed bytes, or null if it is not one of ours.
 *
 * Returning null rather than throwing is what lets isEnvelope() be a cheap
 * synchronous predicate on the response path.
 */
function decodeBlob(blob: string): Bytes | null {
  try {
    return base64ToBytes(blob);
  } catch {
    return null;   // not base64 at all
  }
}

function unpack(value: unknown): Bytes | null {
  if (typeof value !== "object" || value === null) return null;
  const blob = (value as Record<string, unknown>)[FIELD];
  if (typeof blob !== "string" || blob.length === 0) return null;
  const raw = decodeBlob(blob);
  if (raw === null) return null;
  if (raw.length < HEADER_BYTES + TAG_BYTES) return null;
  if (raw[0] !== FORMAT_VERSION) return null;
  return raw;
}

/**
 * True if the SENDER clearly intended this to be an envelope, valid or not.
 *
 * Only asks "is there a non-empty string in the payload field" -- it does NOT
 * check that the bytes decode, and certainly not that they decrypt.
 *
 * Used on the response path so a plaintext body passes through untouched. That
 * tolerance is required, not merely convenient: /health, the file downloads,
 * and unhandled 500s are all plaintext by design on the backend (see
 * app/common/crypto/middleware.py), so assuming every response is sealed would
 * break them.
 *
 * Testing full validity here instead would be worse: a corrupt or
 * future-version envelope would be judged "not an envelope", passed through
 * untouched, and handed to a component as `{d: "..."}` — a confusing shape
 * bug far from its cause. Intent-detection here plus strict validation in
 * openText() turns that into an explicit error instead.
 */
export function looksLikeEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const blob = (value as Record<string, unknown>)[FIELD];
  return typeof blob === "string" && blob.length > 0;
}

/**
 * The imported CryptoKey and its fingerprint, cached as PROMISES rather than
 * resolved values.
 *
 * Both importKey and digest are async, so caching the resolved results would
 * let a burst of concurrent requests each start its own import before the
 * first finished. Caching the promise means every caller after the first
 * awaits the same in-flight work.
 */
let keyPromise: Promise<CryptoKey> | null = null;
let fingerprintPromise: Promise<Bytes> | null = null;

function rawKey(): Bytes {
  const raw = base64ToBytes(KEY_B64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `NEXT_PUBLIC_API_ENCRYPTION_KEY decodes to ${raw.length} bytes; ` +
        `AES-256 needs exactly ${KEY_BYTES}. Regenerate it with ` +
        "`python -m scripts.gen_api_key`."
    );
  }
  return raw;
}

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    if (!encryptionEnabled) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_API_ENCRYPTION_KEY is not set in this build, so payloads " +
            "cannot be encrypted or decrypted."
        )
      );
    }
    keyPromise = subtle().importKey("raw", rawKey(), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
  return keyPromise;
}

/**
 * The first 4 bytes of SHA-256 over the key -- the same derivation the backend
 * performs, so the two agree without either side configuring an id.
 */
function getFingerprint(): Promise<Bytes> {
  if (!fingerprintPromise) {
    fingerprintPromise = subtle()
      .digest("SHA-256", rawKey())
      .then((digest) => new Uint8Array(digest).slice(0, FINGERPRINT_BYTES));
  }
  return fingerprintPromise;
}

/**
 * Encrypt an already-serialised payload.
 *
 * Takes a string rather than an object so serialisation stays the caller's
 * decision -- axios may already hold a JSON string, and re-stringifying it
 * would double-encode. Mirrors the Python side, which likewise seals bytes and
 * leaves JSON to its caller.
 *
 * A fresh random iv is generated per call and cannot be passed in; see the
 * Python module's note on why a repeated iv breaks AES-GCM completely.
 */
export async function sealText(plaintext: string): Promise<Envelope> {
  const [key, fingerprint] = await Promise.all([getKey(), getFingerprint()]);
  const iv = new Uint8Array(new ArrayBuffer(IV_BYTES));
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );

  const packed = new Uint8Array(HEADER_BYTES + ct.length);
  packed[0] = FORMAT_VERSION;
  packed.set(fingerprint, 1);
  packed.set(iv, 1 + FINGERPRINT_BYTES);
  packed.set(ct, HEADER_BYTES);
  return { [FIELD]: bytesToBase64(packed) } as Envelope;
}

/** Decrypt an envelope back to the string that was sealed. */
export async function openText(envelope: Envelope): Promise<string> {
  const raw = unpack(envelope);
  if (raw === null) {
    throw new Error("Payload is not a recognised encrypted envelope.");
  }

  const [key, mine] = await Promise.all([getKey(), getFingerprint()]);
  const theirs = raw.slice(1, 1 + FINGERPRINT_BYTES);

  // Checked before attempting the decrypt purely to produce a useful message.
  // WebCrypto's failure is a bare OperationError with no detail, which tells a
  // developer nothing; a fingerprint mismatch names the actual problem.
  if (theirs.some((b, i) => b !== mine[i])) {
    throw new Error(
      `This API payload was encrypted with key ${toHex(theirs)}, but this build ` +
        `has key ${toHex(mine)}. The frontend and backend are configured with ` +
        "different API encryption keys — rebuild the frontend with the key for " +
        "this environment."
    );
  }

  const iv = raw.slice(1 + FINGERPRINT_BYTES, HEADER_BYTES);
  const ct = raw.slice(HEADER_BYTES);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch {
    // Fingerprint matched, so this is not a key mismatch: the payload was
    // altered in transit, or truncated.
    throw new Error(
      "An API payload failed its integrity check and could not be decrypted. " +
        "The response was altered or truncated in transit."
    );
  }
  return new TextDecoder().decode(plaintext);
}
