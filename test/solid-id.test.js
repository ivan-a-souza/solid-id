"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// test/solid-id.test.ts
const vitest_1 = require("vitest");
const solid_id_1 = require("../src/solid-id");
/**
 * Testes para a geração de IDs com base no algoritmo SOLID ID
 */
(0, vitest_1.describe)('SOLID ID Tests', () => {
    (0, vitest_1.it)('deve gerar um ID com 22 caracteres', () => {
        const id = (0, solid_id_1.generateSolidId)();
        (0, vitest_1.expect)(id).toHaveLength(22);
    });
    (0, vitest_1.it)('deve gerar IDs únicos em chamadas consecutivas', () => {
        const id1 = (0, solid_id_1.generateSolidId)();
        const id2 = (0, solid_id_1.generateSolidId)();
        (0, vitest_1.expect)(id1).not.toBe(id2);
    });
    (0, vitest_1.it)('deve conter apenas caracteres Base62', () => {
        const id = (0, solid_id_1.generateSolidId)();
        (0, vitest_1.expect)(id).toMatch(/^[0-9A-Za-z]{22}$/);
    });
    (0, vitest_1.it)('deve gerar 1 milhão de IDs únicos no mesmo milissegundo', () => {
        // Conjunto para armazenar IDs únicos
        const ids = new Set();
        // Número de iterações
        const iterations = 1000000;
        // Tempo fixo para simular o mesmo milissegundo
        const fixedNow = new Date('2025-01-01T00:00:00Z').getTime();
        // Monkey patch: sobrescreve Date.now temporariamente
        const originalNow = Date.now;
        Date.now = () => fixedNow;
        console.time('Generate IDs');
        for (let i = 0; i < iterations; i++) {
            const id = (0, solid_id_1.generateSolidId)();
            if (ids.has(id)) {
                console.error(`Colisão detectada: ${id}`);
            }
            ids.add(id);
        }
        console.timeEnd('Generate IDs');
        console.log(`IDs únicos gerados: ${ids.size}`);
        // Restaura o comportamento original de Date.now
        Date.now = originalNow;
        (0, vitest_1.expect)(ids.size).toBe(iterations);
    });
    (0, vitest_1.it)('checksum CRC deve detectar alterações nos dados principais', () => {
        // Simula valores fixos
        const timestamp = 1234567890123n;
        const entropy = 987654321987654321n;
        const original = new Uint8Array([
            ...(0, solid_id_1.bigintToBytes)(timestamp, 6),
            ...(0, solid_id_1.bigintToBytes)(entropy, 8)
        ]);
        const crcOriginal = (0, solid_id_1.crc16)(original);
        // Simula corrupção de dados (altera um byte)
        const alterado = new Uint8Array(original);
        alterado[3] ^= 0xFF;
        // Calcula o CRC do dado alterado
        const crcAlterado = (0, solid_id_1.crc16)(alterado);
        // Verifica se o CRC do dado alterado é diferente do original
        (0, vitest_1.expect)(crcAlterado).not.toBe(crcOriginal);
    });
});
