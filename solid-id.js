// solid-id.js
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = BigInt(alphabet.length);

/**
 * Gera um SOLID ID v3 de 128 bits:
 * - 48 bits de timestamp desde 2025-01-01
 * - 64 bits de entropia aleatória
 * - 16 bits de checksum (XOR básico)
 * Retorna uma string Base62 com 22 caracteres.
 */
export function generateSolidId() {
  const epoch = new Date('2025-05-17T00:00:00Z').getTime();
  const now = Date.now();
  const timestamp = BigInt(now - epoch) & ((1n << 48n) - 1n);

  // Entropia: 64 bits aleatórios
  const randHi = BigInt(crypto.getRandomValues(new Uint32Array(1))[0]);
  const randLo = BigInt(crypto.getRandomValues(new Uint32Array(1))[0]);
  const entropy = (randHi << 32n) | randLo;

  // Checksum simples: XOR dos blocos principais
  const checksum = (timestamp ^ entropy) & 0xFFFFn;

  // Concatena os campos em um número de 128 bits
  const id = (timestamp << 80n) | (entropy << 16n) | checksum;

  // Codifica em Base62
  return encodeBase62(id, 22);
}

/**
 * Codifica um BigInt em base62, com padding à esquerda.
 */
function encodeBase62(number, length) {
  let result = '';
  let n = number;
  while (n > 0) {
    const rem = n % BASE;
    result = alphabet[Number(rem)] + result;
    n = n / BASE;
  }
  return result.padStart(length, '0');
}

export default generateSolidId;
