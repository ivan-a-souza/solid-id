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
  MASK_ENTROPY
} from '../src/solid-id';

/**
 * Testes para a geração e validação do SOLID ID
 */
describe('SOLID ID - básico', () => {
  it('deve gerar um ID com 22 caracteres em Base62', () => {
    const id = generateSolidId();
    expect(id).toHaveLength(22);
    expect(id).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  it('deve gerar IDs únicos em chamadas consecutivas', () => {
    const id1 = generateSolidId();
    const id2 = generateSolidId();
    expect(id1).not.toBe(id2);
  });
});

/**
* Validação, parsing e integridade
*/
describe('SOLID ID - validação, parsing e CRC', () => {
  it('deve validar um ID recém-gerado', () => {
    const id = generateSolidId();
    expect(validateSolidId(id)).toBe(true);
  });

  it('deve falhar na validação para um ID alterado', () => {
    const id = generateSolidId();
    const last = id[id.length - 1];
    const other = last === 'A' ? 'B' : 'A';
    const corrupted = id.slice(0, -1) + other;
    expect(validateSolidId(corrupted)).toBe(false);
  });

  it('deve analisar um ID gerado corretamente e se todos os campos estão coerentes e válidos', () => {
    const id = generateSolidId();
    const parsed = parseSolidId(id);

    // Deve indicar válido
    expect(parsed).toBeTruthy();
    expect(parsed.valid).toBe(true);

    // timestampMs deve existir e ser número finito
    expect(typeof parsed.timestampMs).toBe('number');
    expect(Number.isFinite(parsed.timestampMs)).toBe(true);


    // getTimestampFromSolidId deve bater com o timestampMs do parse
    const dt = getTimestampFromSolidId(id);
    expect(dt.getTime()).toBe(parsed.timestampMs);
  });

  it('deve detectar se um ID gerado foi corrompido', () => {
    const id = generateSolidId();
    const last = id[id.length - 1];
    const other = last === '0' ? '1' : '0';
    const corrupted = id.slice(0, -1) + other;
    const parsed = parseSolidId(corrupted) as any;
    expect(parsed.valid).toBe(false);
  });

  it('CRC-16 detecta alteração de payload (timestamp||entropy)', () => {
    // Simula valores fixos
    const timestamp = 1234567890123n;
    const entropy = 987654321987654321n;

    const original = new Uint8Array([
    ...bigintToBytes(timestamp, 6),
    ...bigintToBytes(entropy, 8),
    ]);

    const crcOriginal = crc16CCITT(original);

    // Simula corrupção de dados (altera um byte)
    const alterado = new Uint8Array(original);
    alterado[3] ^= 0xff; // corrompe 1 byte

    // Calcula o CRC do dado alterado
    const crcAlterado = crc16CCITT(alterado);

    // Verifica se o CRC do dado alterado é diferente do original
    expect(crcAlterado).not.toBe(crcOriginal);
  });
});

/**
* Stress test opcional (habilite com STRESS_SOLID=1)
* Evita tornar a suíte lenta em CI.
*/
const STRESS = process.env.STRESS_SOLID === '1';
(STRESS ? describe : describe.skip)('SOLID ID - stress opcional', () => {
  it('deve gerar 1 milhão de IDs únicos no mesmo milissegundo', () => {
    // Conjunto para armazenar IDs únicos
    const ids = new Set<string>();
    // Número de iterações
    const iterations = 1_000_000;
    // Tempo fixo para simular o mesmo milissegundo
    const fixedNow = Date.now() ;
    // Monkey patch: sobrescreve Date.now temporariamente
    const originalNow = Date.now;
    Date.now = () => fixedNow;

    console.time('Generate IDs');
    for (let i = 0; i < iterations; i++) {
      const id = generateSolidId();
      if (ids.has(id)) {
        console.error(`Colisão detectada: ${id}`);
      }
      ids.add(id);
    }
    console.timeEnd('Generate IDs');

    console.log(`IDs únicos gerados: ${ids.size}`);

    // Restaura o comportamento original de Date.now
    Date.now = originalNow;

    expect(ids.size).toBe(iterations);
  }, 60_000); // timeout maior para este teste

  it('deve ser reprodutível com nowMs fixo e rng fixo', () => {
    const fixed = EPOCH_MS + 123_456;
    const rngZero: RandomSource64 = () => 0n;

    const a = generateSolidId({ nowMs: fixed, rng64: rngZero });
    const b = generateSolidId({ nowMs: fixed, rng64: rngZero });
    expect(a).toBe(b);
  });

  it('deve gerar 1 milhão de IDs únicos no mesmo ms com rng sequencial', () => {
    const fixed = EPOCH_MS + 777_777;
    const rngSeq = (seed = 0n): RandomSource64 => {
      let s = seed;
      return () => (s = (s + 1n) & MASK_ENTROPY);
    };

    const set = new Set<string>();
    const rng = rngSeq();
    for (let i = 0; i < 1_000_000; i++) {
      set.add(generateSolidId({ nowMs: fixed, rng64: rng }));
    }
    expect(set.size).toBe(1_000_000);
  });

  it('deve analisar um ID gerado corretamente', () => {
    const id = generateSolidId();
    const parsed = parseSolidId(id);

    if (parsed.valid) {
      console.log(new Date(parsed.timestampMs!)); // data do ID
      console.log(parsed.entropy64!.toString(16)); // entropia em hex
    } else {
      console.warn('ID inválido/corrompido');
    }
  });

});
