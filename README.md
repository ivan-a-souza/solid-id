# SOLID ID

**SOLID ID** (Sortable, Ordered, Legible, Indexed, Distributed) é um gerador de identificadores únicos com as seguintes características:

* Ordenável por tempo (timestamp embutido)
* Altamente seguro (64 bits de entropia aleatória)
* Compacto (22 caracteres Base62)
* Legível por humanos e amigável para bancos de dados e URLs
* Com checksum embutido para validação

Ideal para sistemas distribuídos, rastreamento, APIs, bancos de dados e muito mais.

---

## Instalação

```bash
npm install solid-id
```

---

## Uso

```ts
import generateSolidId from 'solid-id';

const id = generateSolidId();
console.log(id); // Ex: '8Z2pKf21M9sRgXJEyhwVBQKXwbv'
```

---

## Características

| Campo     | Bits | Descrição                                            |
| --------- | ---- | ---------------------------------------------------- |
| Timestamp | 48   | Tempo em milissegundos desde 1985-05-17              |
| Entropia  | 64   | Bits aleatórios gerados com `crypto.getRandomValues` |
| Checksum  | 16   | Verificação simples (XOR entre timestamp e entropia) |
| Total     | 128  | Codificado em 22 caracteres Base62                   |

---

## Vantagens

* Sem dependências externas
* Rápido e seguro
* Funciona tanto em Node.js quanto em browsers modernos
* Seguro para uso em URLs, bancos de dados, JSON, arquivos
* Ordenado lexicograficamente por tempo (ideal para bancos e logs)

---

## Testes

Inclui testes com [Vitest](https://vitest.dev/):

```bash
npm run test
```

Testes cobrem:

* Tamanho do ID (22 caracteres)
* Unicidade em execuções consecutivas
* Uso exclusivo de caracteres Base62

---

## Licença

MIT – Feito com amor por [Ivan Augusto](mailto:ivan.augustoxs@gmail.com).
