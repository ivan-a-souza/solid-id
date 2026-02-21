// src/solid-id.ts

/**
 * Base62 alphabet: used to generate readable and compact strings.
 * The order of characters (0–9, A–Z, a–z) keeps the lexicographical
 * relationship consistent with the numerical order for same-sized strings.
 */
export const ALPHABET: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Base (62) as BigInt, for divisions/modulus of large numbers. */
export const BASE: bigint = BigInt(ALPHABET.length);

/** Lookup table for O(1) Base62 decoding per character. */
const ALPHABET_INDEX: Record<string, number> = (() => {
  const map: Record<string, number> = Object.create(null);
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
  return map;
})();

/**
 * Fixed epoch for the relative timestamp (start of 1985-05-17, 00:00:00Z).
 * -> Arbitrary choice that gives ~8923 years of headroom before overflowing 48 bits.
 */
export const EPOCH_MS: number = new Date('1985-05-17T00:00:00Z').getTime();

/** 48-bit mask for timestamp (2^48 - 1). */
const TIMESTAMP_MASK: bigint = (1n << 48n) - 1n;

/** Bit sizes for the ID components. */
const TIMESTAMP_BITS: number = 48;
const ENTROPY_BITS: number = 64;
const CHECKSUM_BITS: number = 16;

/** Expected length of the Base62 string (encoded 128 bits). */
export const ID_LENGTH: number = 22;

/** Maximum millisecond timestamp representable in 48 bits. */
const MAX_TIMESTAMP_MS_48: number = Number((1n << BigInt(TIMESTAMP_BITS)) - 1n);

/** Precomputed shifts (improves readability of bitpacking/unpacking). */
const SHIFT_FOR_ENTROPY = BigInt(CHECKSUM_BITS);
const SHIFT_FOR_TIMESTAMP = BigInt(ENTROPY_BITS + CHECKSUM_BITS);

/** Useful masks for extraction. */
const MASK_CHECKSUM = (1n << BigInt(CHECKSUM_BITS)) - 1n;
export const MASK_ENTROPY = (1n << BigInt(ENTROPY_BITS)) - 1n;

/** 64-bit randomness source */
export type RandomSource64 = () => bigint;

/** Options for ID generation */
export interface GenerateOptions {
  /** freeze time in ms for testing/benchmarks */
  nowMs?: number;
  /** 64-bit deterministic entropy source for testing */
  rng64?: RandomSource64;
  /** custom crypto source (for testing/fuzzing) */
  crypto?: Crypto;
}

/** 
 * CRC-16-CCITT (polynomial 0x1021) – precomputed table for performance.
 * IIFE (Immediately Invoked Function Expression) to initialize the table.
*/
const CRC_TABLE: number[] = (() => {
  const table: number[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
    table[i] = crc & 0xffff;
  }
  return table;
})();

/**
 * Gets a secure Crypto API implementation.
 * @param options Options that may contain a custom Crypto implementation
 * @returns The available secure Crypto implementation
 * @throws Error if no secure source of randomness is available
 */
function getCrypto(options?: GenerateOptions): Crypto {
  if (options?.crypto?.getRandomValues) return options.crypto;
  const g = globalThis as any;
  if (g.crypto?.getRandomValues) return g.crypto;
  throw new Error('Crypto API is not available in this environment; pass options.crypto or use Node >=18 / modern browsers.');
}

/**
 * Optimized implementation of the CRC-16-CCITT algorithm for a byte array.
 * Polynomial used: x^16 + x^12 + x^5 + 1 (0x1021)
 * @param input Byte array ((timestamp[6] + entropy[8]) - 112 bits) to calculate the CRC
 * @returns Calculated CRC-16-CCITT value as an integer (0..65535)
 */
export function crc16CCITT(input: Uint8Array): number {
  // Initializes the CRC value
  let crc = 0xFFFF;
  // Processes each byte of the input
  for (let i = 0; i < input.length; i++) {
    crc = ((crc << 8) & 0xFF00) ^ CRC_TABLE[((crc >> 8) & 0xFF) ^ input[i]];
  }
  return crc & 0xFFFF;
}

/**
 * Converts a BigInt to a big-endian byte sequence (Uint8Array) with fixed length.
 * @param value The BigInt value to convert
 * @param byteLength Number of desired bytes in the output array (left-padded with zeros if necessary)
 * @returns Byte array representing the BigInt
 */
export function bigintToBytes(value: bigint, byteLength: number): Uint8Array {
  // Creates a byte array with the specified length
  const out = new Uint8Array(byteLength);

  // Copy of the value for manipulation
  let v = value;

  // Fills the array with the BigInt bytes
  for (let i = byteLength - 1; i >= 0; i--) {
    // Extracts the least significant byte and stores it in the array
    out[i] = Number(v & 0xFFn);
    // Shifts the value to process the next byte
    v >>= 8n;
  }
  // Returns the filled byte array
  return out;
}

/**
 * Encodes a large integer (BigInt) to Base62 with fixed length up to ID_LENGTH.
 * @param number Large integer to encode
 * @returns Base62 encoded string with length ID_LENGTH
 */
export function encodeBase62(number: bigint = 0n): string {
  // If the number is zero, returns a string of zeros with the fixed length
  if (number === 0n) return '0'.padStart(ID_LENGTH, '0');

  let result: string = '';
  let n: bigint = number;

  // Converts to base62 iteratively
  while (n > 0n) {
    const rem: bigint = n % BASE;
    result = ALPHABET[Number(rem)] + result;
    n = n / BASE;
  }

  // Left-pads with zeros to maintain the fixed size
  return result.padStart(ID_LENGTH, '0');
}

/**
 * Decodes a Base62 string to a BigInt
 * @param str The Base62 string to decode (only [0-9A-Za-z])
 * @returns The numerical value as a BigInt
 * @throws Error if the string contains invalid characters
*/
export function decodeBase62(str: string): bigint {
  let result: bigint = 0n;
  
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const v = ALPHABET_INDEX[c];
    if (v === undefined) throw new Error(`Invalid character in Base62 string: ${c} at position ${i}`);
    result = result * BASE + BigInt(v);
  }
  return result;
}

/**
 * Extracts ID fields into BigInts and calculates the expected CRC.
 * Internal use to avoid duplication in validateSolidId/parseSolidId.
 */
function extractFieldsFromBigint(fullId: bigint): {
  timestamp48: bigint;
  entropy64:  bigint;
  checksum16: bigint;
  computedChecksum16: bigint;
} {
  // Extracts raw components
  const checksum16 = fullId & MASK_CHECKSUM;
  const timestamp48 = fullId >> SHIFT_FOR_TIMESTAMP;
  const entropy64  = (fullId >> SHIFT_FOR_ENTROPY) & MASK_ENTROPY;

  // Recalculates CRC from the extracted timestamp (6 bytes) and entropy (8 bytes). (Main 112 bits - 14 bytes)
  const timestampBytes = bigintToBytes(timestamp48, 6);
  const entropyBytes = bigintToBytes(entropy64, 8);
  const combined = new Uint8Array(14);
  combined.set(timestampBytes, 0);
  combined.set(entropyBytes, 6);
  const computedChecksum16 = BigInt(crc16CCITT(combined));

  return {
    timestamp48, entropy64, checksum16, computedChecksum16
  };
}

/**
 * Generates a 128-bit SOLID ID:
 * ID Layout (big-endian):
 * - 48 bits of timestamp since 1985-05-17 (sortable)
 * - 64 bits of random cryptographic entropy per millisecond (high security)
 * - 16 bits of checksum (CRC-16-CCITT) for integrity validation
 * @returns 22-character Base62 string, unique and sortable (URL-safe, database-friendly)
 * @throws Error if crypto API is not available
 * @throws Error if timestamp value is invalid
 * @example
 * const id = generateSolidId();
 * console.log(id); // "00Dk4...xYz"
 */
export function generateSolidId(options?: GenerateOptions): string {
  const cryptoImpl = getCrypto(options);

  // Gets the current time in milliseconds
  const now: number = typeof options?.nowMs === 'number' ? options.nowMs : Date.now();

  // Calculates the time since the defined epoch
  const timeSinceEpoch: number = now - EPOCH_MS;

  // Checks if the time since epoch is within the 48-bit limit
  if (timeSinceEpoch < 0 || timeSinceEpoch > MAX_TIMESTAMP_MS_48) { 
    throw new Error('Invalid timestamp value (out of 48-bit range)');
  }

  // Calculates the timestamp relative to the epoch as BigInt and limits to 48 bits
  const timestamp: bigint = BigInt(timeSinceEpoch) & TIMESTAMP_MASK;

  // Entropy: uses injected rng if provided; otherwise uses crypto
  const entropy =
    typeof options?.rng64 === 'function'
      ? (options?.rng64() & MASK_ENTROPY)
      : (() => {
          // Generates two 32-bit random numbers and combines them into 64 bits of secure cryptographic entropy
          const randBuffer = new Uint32Array(2);
          cryptoImpl.getRandomValues(randBuffer);
          const randHi: bigint = BigInt(randBuffer[0]);
          const randLo: bigint = BigInt(randBuffer[1]);
          return (randHi << 32n) | randLo;
        })();

  // Converts timestamp to a 6-byte array
  const timestampBytes: Uint8Array = bigintToBytes(timestamp, 6);
  // Converts entropy to an 8-byte array
  const entropyBytes: Uint8Array = bigintToBytes(entropy, 8);
  // Combines timestamp (6) and entropy (8) bytes to calculate the CRC (14 bytes)
  const combined: Uint8Array = new Uint8Array(14);
  combined.set(timestampBytes, 0);
  combined.set(entropyBytes, 6);

  // Calculates the CRC-16-CCITT checksum of the 112 bits (14 bytes)
  const crc: bigint = BigInt(crc16CCITT(combined));

  // Combines components into a single 128-bit BigInt - 48 (timestamp) + 64 (entropy) + 16 (checksum)
  const id: bigint = (timestamp << SHIFT_FOR_TIMESTAMP) | (entropy << SHIFT_FOR_ENTROPY) | crc;

  // Converts the final number to a readable Base62 string with padding
  return encodeBase62(id);
}

/** * Verifies if a SOLID ID is valid using the internal CRC
 * @param id The Base62 ID string to validate 
 * @returns true if the ID is valid, false otherwise 
 * @example
 * validateSolidId('00Dk4...xYz') // true/false
*/
export function validateSolidId(id: string): boolean {
  // Uses the existing parser to validate the ID
  return parseSolidId(id).valid;
}

/**
 * Extracts the timestamp as a Date object from a SOLID ID
 * @param id The Base62 ID string (22 characters)
 * @returns The Date object corresponding to the ID's timestamp
 * @throws Error if the ID is invalid
 */
export function getTimestampFromSolidId(id: string): Date {
  // Reuses the parser to extract the timestamp
  const parsed = parseSolidId(id);
  // Validates the ID before returning the date
  if (!parsed.valid || typeof parsed.timestampMs !== 'number') {
    // Invalid ID
    throw new Error('Invalid SOLID ID');
  }
  // Returns the date corresponding to the extracted timestamp
  return new Date(parsed.timestampMs)
}

/**
 * Possible status types when analyzing a SOLID ID
 * @remarks
 * Useful for detailed diagnostics.
 */
export type SolidIdParseStatus =
  | 'OK'
  | 'INVALID_LENGTH'
  | 'INVALID_FORMAT'
  | 'DECODE_ERROR'
  | 'INVALID_CHECKSUM';

/** 
 * Interface for the SOLID ID analysis result
 */
export interface ParsedSolidId {
  /** Analyzed ID (input echo) */
  id: string;
  
  /** true if the ID passed all validations (format + checksum) */
  valid: boolean;

  /** Detailed analysis status (reason for invalidity or OK) */
  status: SolidIdParseStatus;

  /** Absolute timestamp in ms since 1970-01-01Z, if valid */
  timestampMs?: number;

   /** Raw 48-bit timestamp, relative to EPOCH_MS, if valid */
  timestamp48?: bigint;

  /** Raw 64-bit entropy, if valid */
  entropy64?: bigint;
  
  /** 16-bit checksum stored in the ID */
  checksum16?: bigint;

  /** Recalculated checksum from (timestamp||entropy) */
  computedChecksum16?: bigint;

  /** Internal error message (useful for logs/debugging), if applicable */
  errorMessage?: string;
}

/**
 * Analyzes a SOLID ID and extracts its components.
 * @param id The Base62 ID string (22 characters)
 * @returns An object with the analyzed components and ID validity
 * @remarks
 * Useful for auditing, debugging, and time-window metrics.
 * @example
 * const parsed = parseSolidId(id);
 * if (parsed.valid) console.log(new Date(parsed.timestampMs!));
 */
export function parseSolidId(id: string): ParsedSolidId {
  // Base result for any failure
  const base: ParsedSolidId = {
    id,
    valid: false,
    status: 'INVALID_LENGTH',
  };

  // 1) Length
  if (id.length !== ID_LENGTH) {
    return base;
  }

  // 2) Format (only [0-9A-Za-z])
  if (!/^[0-9A-Za-z]+$/.test(id)) {
    return {
      ...base,
      status: 'INVALID_FORMAT',
    };
  }
  
  try {
    // 3) Decodes Base62 to raw 128-bit BigInt
    const fullId = decodeBase62(id);
    
    // 4) Extracts fields and recalculates CRC-16
    const { 
      timestamp48, 
      entropy64,
      checksum16,
      computedChecksum16
    } = extractFieldsFromBigint(fullId);

    // 5) Inconsistent checksum
    if (checksum16 !== computedChecksum16) {
      return {
        id,
        valid: false,
        status: 'INVALID_CHECKSUM',
        timestamp48,
        entropy64,
        checksum16,
        computedChecksum16,
      };
    }
    
    // 6) All OK: converts relative timestamp → absolute ms
    const timestampMs = Number(timestamp48) + EPOCH_MS;

    return {
      id,
      valid: true,
      status: 'OK',
      timestampMs,
      timestamp48,
      entropy64,
      checksum16,
      computedChecksum16,
    };
  } catch (err) {
    // Theoretically, with the regex, DECODE_ERROR only occurs in extreme cases,
    // but it's good to map this scenario for debug/log.
    return {
      id,
      valid: false,
      status: 'DECODE_ERROR',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export default generateSolidId;
