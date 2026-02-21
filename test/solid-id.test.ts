// test/solid-id.test.ts
import { describe, it, expect } from 'vitest';
import { 
  generateSolidId, 
  validateSolidId,
  getTimestampFromSolidId,
  parseSolidId,
  bigintToBytes,
  crc16CCITT,
  EPOCH_MS,
  RandomSource64,
  MASK_ENTROPY,
  encodeBase62,
  decodeBase62
} from '../src/solid-id';

/**
 * Tests for SOLID ID generation and validation
 */
describe('SOLID ID - Basic', () => {
  it('should generate a 22-character Base62 ID', () => {
    const id = generateSolidId();
    expect(id).toHaveLength(22);
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  it('should generate unique IDs in consecutive calls', () => {
    const id1 = generateSolidId();
    const id2 = generateSolidId();
    expect(id1).not.toBe(id2);
  });
});

/**
 * Validation, parsing, and integrity tests
 */
describe('SOLID ID - Validation, Parsing, and CRC', () => {
  it('should validate a freshly generated ID', () => {
    const id = generateSolidId();
    expect(validateSolidId(id)).toBe(true);
  });

  it('should fail validation for a corrupted ID', () => {
    const id = generateSolidId();
    const last = id[id.length - 1];
    const other = last === 'A' ? 'B' : 'A';
    const corrupted = id.slice(0, -1) + other;
    expect(validateSolidId(corrupted)).toBe(false);
  });

  it('should correctly parse a generated ID and verify field consistency', () => {
    const id = generateSolidId();
    const parsed = parseSolidId(id);

    // Should indicate valid
    expect(parsed).toBeTruthy();
    expect(parsed.valid).toBe(true);
    expect(parsed.status).toBe('OK');

    // timestampMs should exist and be a finite number
    expect(typeof parsed.timestampMs).toBe('number');
    expect(Number.isFinite(parsed.timestampMs)).toBe(true);

    // getTimestampFromSolidId should match the parsed timestampMs
    const dt = getTimestampFromSolidId(id);
    expect(dt.getTime()).toBe(parsed.timestampMs);
  });

  it('should detect if a generated ID was corrupted', () => {
    const id = generateSolidId();
    const corrupted = id.slice(0, -1) + (id.endsWith('0') ? '1' : '0');
    const parsed = parseSolidId(corrupted);
    expect(parsed.valid).toBe(false);
    expect(parsed.status).toBe('INVALID_CHECKSUM');
  });

  it('CRC-16 should detect changes in payload (timestamp||entropy)', () => {
    // Simulates fixed values
    const timestamp = 1234567890123n;
    const entropy = 987654321987654321n;

    const original = new Uint8Array([
    ...bigintToBytes(timestamp, 6),
    ...bigintToBytes(entropy, 8),
    ]);

    const crcOriginal = crc16CCITT(original);

    // Simulates data corruption (alters one byte)
    const altered = new Uint8Array(original);
    altered[3] ^= 0xff; // corrupts 1 byte

    // Calculates CRC of the altered data
    const crcAltered = crc16CCITT(altered);

    // Verifies if the altered CRC is different from the original
    expect(crcAltered).not.toBe(crcOriginal);
  });

  it('encodeBase62/decodeBase62 should maintain value (round-trip)', () => {
    for (let i = 0; i < 200; i++) {
      // generates a random bigint up to 128 bits
      const a = BigInt.asUintN(128, BigInt(Math.floor(Math.random()*2**30)) << 98n | 123456789n);
      const enc = encodeBase62(a);
      const dec = decodeBase62(enc);
      expect(dec).toBe(a);
    }
  });

  it('lexicographical ordering should follow time', () => {
    const t0 = EPOCH_MS + 1_000;
    const ids = [
      generateSolidId({ nowMs: t0 }),
      generateSolidId({ nowMs: t0 + 1 }),
      generateSolidId({ nowMs: t0 + 2 }),
    ];
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('should fail for invalid length and invalid characters', () => {
    expect(validateSolidId('')).toBe(false);
    expect(validateSolidId('A'.repeat(21))).toBe(false);
    expect(() => decodeBase62('!'.repeat(22))).toThrow();
  });

  it('should respect 48-bit timestamp limits', () => {
    const max = EPOCH_MS + Number((1n << 48n) - 1n);
    expect(() => generateSolidId({ nowMs: max })).not.toThrow();
    expect(() => generateSolidId({ nowMs: max + 1 })).toThrow(); // out of range
  });
});

/**
 * Optional stress tests (enable with STRESS_SOLID=1)
 * Avoids slowing down the suite in CI.
 */
describe.skipIf(!process.env.STRESS_SOLID)('SOLID ID - Optional Stress Tests', () => {
  it('should generate 1 million unique IDs within the same millisecond', () => {
    // Set to store unique IDs
    const ids = new Set<string>();
    // Number of iterations
    const iterations = 1_000_000;
    // Fixed time to simulate the same millisecond
    const fixedNow = Date.now() ;
    // Monkey patch: temporarily overrides Date.now
    const originalNow = Date.now;
    Date.now = () => fixedNow;

    console.time('Generate IDs');
    for (let i = 0; i < iterations; i++) {
      const id = generateSolidId();
      if (ids.has(id)) {
        console.error(`Collision detected: ${id}`);
      }
      ids.add(id);
    }
    console.timeEnd('Generate IDs');

    console.log(`Unique IDs generated: ${ids.size}`);

    // Restores original Date.now behavior
    Date.now = originalNow;

    expect(ids.size).toBe(iterations);
  }, 60_000); // higher timeout for this test

  it('should be reproducible with fixed nowMs and fixed rng', () => {
    const fixed = EPOCH_MS + 123_456;
    const rngZero: RandomSource64 = () => 0n;

    const a = generateSolidId({ nowMs: fixed, rng64: rngZero });
    const b = generateSolidId({ nowMs: fixed, rng64: rngZero });
    expect(a).toBe(b);
  });

  it('should generate 1 million unique IDs within the same millisecond with sequential rng', () => {
    // Set to store unique IDs
    const ids = new Set<string>();
    // Number of iterations
    const iterations = 1_000_000;
    // Fixed time to simulate the same millisecond
    const fixed = EPOCH_MS + 777_777;
    const rngSeq = (seed = 0n): RandomSource64 => {
      let s = seed;
      return () => (s = (s + 1n) & MASK_ENTROPY);
    };
    const rng = rngSeq();
    console.time('Generate IDs');
    for (let i = 0; i < iterations; i++) {
      ids.add(generateSolidId({ nowMs: fixed, rng64: rng }));
    }
    console.timeEnd('Generate IDs');

    console.log(`Unique IDs generated: ${ids.size}`);

    expect(ids.size).toBe(iterations);
  }, 60_000); // higher timeout for this test

  it('should correctly parse a generated ID', () => {
    const id = generateSolidId();
    const parsed = parseSolidId(id);

    if (parsed.valid) {
      console.log(new Date(parsed.timestampMs!)); // ID date
      console.log(parsed.entropy64!.toString(16)); // entropy in hex
    } else {
      console.warn('Invalid/corrupted ID');
    }
  });

});
