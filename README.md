# SOLID ID

**SOLID ID** (Sortable, Ordered, Legible, Indexed, Distributed) is a unique identifier generator with the following features:

* **Sortable** by time (embedded timestamp)
* **Highly secure** (64 bits of random entropy)
* **Compact** (22 Base62 characters)
* **Human-readable** and friendly for databases and URLs
* **Built-in checksum** for integrity validation

Ideal for distributed systems, tracking, APIs, databases, and more.

---

## Installation

```bash
npm install solid-id
```

---

## Usage

### Basic

```ts
import { generateSolidId } from 'solid-id';

const id = generateSolidId();
console.log(id); // e.g., '8Z2pKf21M9sRgXJEyhwVBQ'
```

### Advanced

`solid-id` exports utilities for validation and parsing:

```ts
import { 
  generateSolidId, 
  validateSolidId, 
  getTimestampFromSolidId, 
  parseSolidId 
} from 'solid-id';

// 1. Generate ID
const id = generateSolidId();

// 2. Validate ID (checks format and checksum)
if (validateSolidId(id)) {
  console.log('Valid and healthy ID!');
}

// 3. Extract Timestamp
try {
  const date = getTimestampFromSolidId(id);
  console.log(`Created at: ${date.toISOString()}`);
} catch (err) {
  console.error('Invalid ID');
}

// 4. Detailed Parsing (useful for debugging/logs)
const parsed = parseSolidId(id);
if (parsed.valid) {
  console.log(`Timestamp (ms): ${parsed.timestampMs}`);
  console.log(`Entropy (64-bit): ${parsed.entropy64}`);
} else {
  console.error(`Error: ${parsed.status}`); // e.g., INVALID_CHECKSUM
}
```

---

## API

### `generateSolidId(options?)`
Generates a 128-bit unique identifier encoded in Base62.
- **options.nowMs**: (number) Custom timestamp (useful for testing).
- **options.rng64**: (function) Custom entropy source.

### `validateSolidId(id)`
Returns `true` if the ID is in the correct format and the checksum is valid.

### `getTimestampFromSolidId(id)`
Returns a `Date` object extracted from the ID. Throws an error if the ID is invalid.

### `parseSolidId(id)`
Returns a `ParsedSolidId` object with internal details:
- `valid`: boolean
- `timestampMs`: number (if valid)
- `entropy64`: bigint (if valid)
- `status`: 'OK' | 'INVALID_LENGTH' | 'INVALID_CHECKSUM' | ...

---

## Features

| Field     | Bits | Description                                             |
| --------- | ---- | ------------------------------------------------------- |
| Timestamp | 48   | Time in milliseconds since 1985-05-17                   |
| Entropy   | 64   | Random bits generated with `crypto.getRandomValues`     |
| Checksum  | 16   | Simple verification (XOR between timestamp and entropy) |
| Total     | 128  | Encoded in 22 Base62 characters                         |

---

## Advantages

* Zero external dependencies
* Fast and secure
* Works in both Node.js and modern browsers
* URL-safe, database-friendly, JSON-compatible
* Lexicographically sortable by time (ideal for DB indexes and logs)

---

## Testing

Includes tests powered by [Vitest](https://vitest.dev/):

```bash
npm run test
```

Tests cover:

* **Basic Generation**: ID length (22 characters) and uniqueness.
* **Integrity**: Built-in validation and CRC-16 checksum verification.
* **Ordering**: Time-based lexicographical sortability.
* **Accuracy**: High-precision Base62 encoding/decoding (round-trip).
* **Stress Tests**: Proof of uniqueness for 1 million+ IDs generated within the same millisecond (run with `STRESS_SOLID=1 npm run test`).

---

## License

MIT – Made with love by [Ivan Augusto](mailto:ivan.augustoxs@gmail.com).
