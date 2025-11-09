// src/solid-id.ts

/**
 * Alfabeto base62: usado para gerar strings legíveis e compactas.
 * A ordem dos caracteres (0–9, A–Z, a–z) mantém a relação
 * lexicográfica consistente com a ordem numérica para strings de mesmo tamanho.
 */
export const alphabet: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Base (62) como BigInt, para divisões/módulos de números grandes. */
export const BASE: bigint = BigInt(alphabet.length);

/** Tabela de lookup para decodificação Base62 O(1) por caractere. */
const ALPHABET_INDEX: Record<string, number> = (() => {
  const map: Record<string, number> = Object.create(null);
  for (let i = 0; i < alphabet.length; i++) map[alphabet[i]] = i;
  return map;
})();

/**
 * Época fixa para o timestamp relativo (início de 1985-05-17, 00:00:00Z).
 * -> Escolha arbitrária que dá folga de ~8923 anos antes de estourar 48 bits.
 */
export const EPOCH_MS: number = new Date('1985-05-17T00:00:00Z').getTime();

/** Máscara de 48 bits para timestamp (2^48 - 1). */
const TIMESTAMP_MASK: bigint = (1n << 48n) - 1n;

/** Tamanhos em bits dos componentes do ID. */
const TIMESTAMP_BITS: number = 48;
const ENTROPY_BITS: number = 64;
const CHECKSUM_BITS: number = 16;

/** Comprimento esperado da string Base62 (128 bits codificados). */
export const ID_LENGTH: number = 22;

/** Limite máximo de milissegundos representável em 48 bits. */
const MAX_TIMESTAMP_MS_48: number = Number((1n << BigInt(TIMESTAMP_BITS)) - 1n);

/** Deslocamentos precomputados (melhora leitura de bitpacking/desbitpacking). */
const SHIFT_FOR_ENTROPY = BigInt(CHECKSUM_BITS);
const SHIFT_FOR_TIMESTAMP = BigInt(ENTROPY_BITS + CHECKSUM_BITS);

/** Máscaras úteis para extração. */
const MASK_CHECKSUM = (1n << BigInt(CHECKSUM_BITS)) - 1n;
export const MASK_ENTROPY = (1n << BigInt(ENTROPY_BITS)) - 1n;

/** Fonte de aleatoriedade de 64 bits */
export type RandomSource64 = () => bigint;

/** Opções para a geração de IDs */
export interface GenerateOptions {
  /** congelar o tempo em ms para testes/benchmarks */
  nowMs?: number;
  /** fonte de entropia determinística de 64 bits, para testes */
  rng64?: RandomSource64;
  /** fonte de crypto customizada (para testes/fuzz) */
  crypto?: Crypto;
}

/** 
 * CRC-16-CCITT (polinômio 0x1021) – tabela pré-calculada para performance.
 * IIFE (Immediately Invoked Function Expression) para inicializar a tabela
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
 * Obtém a implementação de Crypto API segura.
 * @param options Opções que podem conter uma implementação customizada de Crypto
 * @returns A implementação de Crypto segura disponível
 * @throws Error se nenhuma fonte segura de aleatoriedade estiver disponível
 */
function getCrypto(options?: GenerateOptions): Crypto {
  if (options?.crypto?.getRandomValues) return options.crypto;
  const g = globalThis as any;
  if (g.crypto?.getRandomValues) return g.crypto;
  throw new Error('Crypto API is not available in this environment; pass options.crypto or use Node >=18 / modern browsers.');
}

/**
 * Implementação otimizada do algoritmo CRC-16-CCITT para um array de bytes.
 * Polinômio usado: x^16 + x^12 + x^5 + 1 (0x1021)
 * @param input Array de bytes ((timestamp[6] + entropy[8]) - 112 bits) para calcular o CRC
 * @returns Valor CRC-16-CCITT calculado como número inteiro (0..65535)
 */
export function crc16CCITT(input: Uint8Array): number {
  // Inicializa o valor do CRC
  let crc = 0xFFFF;
  // Processa cada byte do input
  for (let i = 0; i < input.length; i++) {
    crc = ((crc << 8) & 0xFF00) ^ CRC_TABLE[((crc >> 8) & 0xFF) ^ input[i]];
  }
  return crc & 0xFFFF;
}

/**
 * Converte um BigInt para uma sequência de bytes (Uint8Array) big-endian com tamanho fixo.
 * @param value O valor BigInt a ser convertido
 * @param byteLength Número de bytes desejados no array de saída (preenchido com zeros à esquerda se necessário)
 * @returns Array de bytes representando o BigInt
 */
export function bigintToBytes(value: bigint, byteLength: number): Uint8Array {
  // Cria um array de bytes com o comprimento especificado
  const out = new Uint8Array(byteLength);

  // Cópia do valor para manipulação
  let v = value;

  // Preenche o array com os bytes do BigInt
  for (let i = byteLength - 1; i >= 0; i--) {
    // Extrai o byte menos significativo e armazena no array
    out[i] = Number(v & 0xFFn);
    // Desloca o valor para processar o próximo byte
    v >>= 8n;
  }
  // Retorna o array de bytes preenchido
  return out;
}

/**
 * Codifica um número inteiro grande (BigInt) para Base62 com comprimento fixo até ID_LENGTH.
 * @param number Número inteiro grande a ser codificado
 * @returns String codificada em base62 com comprimento ID_LENGTH
 */
export function encodeBase62(number: bigint): string {
  // Se o número for zero, retorna uma string de zeros com o comprimento fixo
  if (number === 0n) return '0'.padStart(ID_LENGTH, '0');

  let result: string = '';
  let n: bigint = number;

  // Converte para base62 iterativamente
  while (n > 0n) {
    const rem: bigint = n % BASE;
    result = alphabet[Number(rem)] + result;
    n = n / BASE;
  }

  // Preenche com zeros à esquerda para manter o tamanho fixo
  return result.padStart(ID_LENGTH, '0');
}

/**
 * Decodifica uma string Base62 para um BigInt
 * @param str A string Base62 a ser decodificada (somente [0-9A-Za-z])
 * @returns O valor numérico como BigInt
 * @throws Error se a string contiver caracteres inválidos
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
 * Gera um SOLID ID de 128 bits:
 * Layout (big-endian) do ID:
 * - 48 bits de timestamp desde 1985-05-17 (ordenável)
 * - 64 bits de entropia criptográfica aleatória por milissegundo (alta segurança)
 * - 16 bits de checksum (CRC-16-CCITT) para validação de integridade
 * @returns string Base62 com 22 caracteres, única e ordenável (URL-safe, banco-friendly)
 * @throws Error se a crypto API não estiver disponível
 * @throws Error se o valor do timestamp for inválido
 */
export function generateSolidId(options?: GenerateOptions): string {
  const cryptoImpl = getCrypto();

  // Obtém o tempo atual em milissegundos
  const now: number = typeof options?.nowMs === 'number' ? options.nowMs : Date.now();

  // Calcula o tempo desde a época definida
  const timeSinceEpoch: number = now - EPOCH_MS;

  // Verifica se o tempo desde a época está dentro do limite de 48 bits
  if (timeSinceEpoch < 0 || timeSinceEpoch > MAX_TIMESTAMP_MS_48) { 
    throw new Error('Invalid timestamp value (out of 48-bit range)');
  }

  // Calcula o timestamp relativo à época como BigInt e limita a 48 bits
  const timestamp: bigint = BigInt(timeSinceEpoch) & TIMESTAMP_MASK;

  // Entropia: usa rng injetado se fornecido; caso contrário usa crypto
  const entropy =
    typeof options?.rng64 === 'function'
      ? (options?.rng64() & MASK_ENTROPY)
      : (() => {
          // Gera dois números aleatórios de 32 bits e combina em 64 bits de entropia criptográfica segura
          const randBuffer = new Uint32Array(2);
          cryptoImpl.getRandomValues(randBuffer);
          const randHi: bigint = BigInt(randBuffer[0]);
          const randLo: bigint = BigInt(randBuffer[1]);
          return (randHi << 32n) | randLo;
        })();

  // Converte timestamp para arrays de 6 bytes
  const timestampBytes: Uint8Array = bigintToBytes(timestamp, 6);
  // Converte entropia para arrays de 8 bytes
  const entropyBytes: Uint8Array = bigintToBytes(entropy, 8);
  // Combina os bytes de timestamp (6) e entropia (8) para calcular o CRC (14 bytes)
  const combined: Uint8Array = new Uint8Array(14);
  combined.set(timestampBytes, 0);
  combined.set(entropyBytes, 6);

  // Calcula o checksum CRC-16-CCITT dos 112 bits (14 bytes)
  const crc: bigint = BigInt(crc16CCITT(combined));

  // Combina os componentes em um único BigInt de 128 bits - 48 (timestamp) + 64 (entropia) + 16 (checksum)
  const id: bigint = (timestamp << SHIFT_FOR_TIMESTAMP) | (entropy << SHIFT_FOR_ENTROPY) | crc;

  // Converte o número final para uma string base62 legível com padding
  return encodeBase62(id);
}

/** * Verifica se um SOLID ID é válido usando o CRC interno
 * @param id A string de ID em Base62 para validar 
 * @returns true se o ID é válido, false caso contrário 
 * @example
 * validateSolidId('00Dk4...xYz') // true/false
*/
export function validateSolidId(id: string): boolean { 
  // Verifica se o ID tem o comprimento correto e contém apenas caracteres válidos 
  if (id.length !== ID_LENGTH || !/^[0-9A-Za-z]+$/.test(id)) return false; 
  
  // Tenta extrair e validar os componentes do ID
  try { 
    // Converte a string Base62 de volta para um BigInt
    const fullId = decodeBase62(id);
    // Extrai os componentes 
    const storedChecksum = fullId & MASK_CHECKSUM;
    const timestamp = fullId >> SHIFT_FOR_TIMESTAMP;
    const entropy = (fullId >> SHIFT_FOR_ENTROPY) & MASK_ENTROPY;
    
    // Recalcula CRC a partir do timestamp e entropia extraídos. (112 bits principais - 14 bytes)
    const timestampBytes = bigintToBytes(timestamp, 6);
    const entropyBytes = bigintToBytes(entropy, 8);
    const combined = new Uint8Array(14);
    combined.set(timestampBytes, 0);
    combined.set(entropyBytes, 6);

    // Calcula o checksum
    const calculatedChecksum = BigInt(crc16CCITT(combined));
    
    // Compara os checksums
    return storedChecksum === calculatedChecksum;
  } catch (e) { 
    // Em caso de erro (decodificação inválida), retorna falso
    return false; 
  }
}

/**
 * Extrai o timestamp como um objeto Date de um SOLID ID
 * @param id A string de ID em Base62 (22 caracteres)
 * @returns O objeto Date correspondente ao timestamp do ID
 * @throws Error se o ID for inválido
 */
export function getTimestampFromSolidId(id: string): Date {
  // Valida o ID antes de extrair o timestamp
  if (!validateSolidId(id)) throw new Error('Invalid SOLID ID');
  // Decodifica o ID
  const fullId = decodeBase62(id);
  // Extrai o timestamp (48 bits mais significativos)
  const timestamp = fullId >> SHIFT_FOR_TIMESTAMP;
  // Converte o timestamp relativo para milissegundos absolutos
  const timestampMs = Number(timestamp) + EPOCH_MS;
  // Retorna o objeto Date correspondente
  return new Date(timestampMs);
}

/** 
 * Interface para o resultado da análise de um SOLID ID
 */
export interface ParsedSolidId {
  valid: boolean;        // validação via CRC
  timestampMs?: number;  // Date.UTC ms, se válido
  timestamp48?: bigint;  // timestamp bruto (48 bits)
  entropy64?: bigint;    // entropia bruta (64 bits)
  checksum16?: number;   // CRC-16
}

/**
 * Analisa um SOLID ID e extrai seus componentes.
 * @param id A string de ID em Base62 (22 caracteres)
 * @returns Um objeto com os componentes analisados e a validade do ID
 */
export function parseSolidId(id: string): ParsedSolidId {
  // Resultado padrão para IDs inválidos
  const result: ParsedSolidId = { valid: false };
  
  // Verifica o comprimento e os caracteres válidos
  if (id.length !== ID_LENGTH || !/^[0-9A-Za-z]+$/.test(id)) return result;

  try {
    // Decodifica o ID
    const fullId = decodeBase62(id);
    
    // Extrai os componentes
    const checksum16 = Number(fullId & MASK_CHECKSUM);
    const timestamp48 = fullId >> SHIFT_FOR_TIMESTAMP;
    const entropy64 = (fullId >> SHIFT_FOR_ENTROPY) & MASK_ENTROPY;

    // Recalcula o CRC para validação
    const timestampBytes = bigintToBytes(timestamp48, 6);
    const entropyBytes = bigintToBytes(entropy64, 8);
    const combined = new Uint8Array(14);
    combined.set(timestampBytes, 0);
    combined.set(entropyBytes, 6);
    const calculatedChecksum = crc16CCITT(combined);

    // Compara os checksums e retorna o resultado se for inválido
    if (checksum16 !== calculatedChecksum) return { valid: false }
    
    const timestampMs = Number(timestamp48) + EPOCH_MS;
    return {
      valid: true,
      timestampMs,
      timestamp48,
      entropy64,
      checksum16
    };
  } catch {
    return result;
  }
}

export default generateSolidId;
