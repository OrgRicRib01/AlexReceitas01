# Fichas Técnicas — Biblioteca

Ferramenta web para criar, custear e guardar fichas técnicas de cozinha, baseada no modelo *Ficha Técnica de Preparação* do curso.

**Línguas:** português (Portugal), English (UK), español (España).

## Funcionalidades

- Biblioteca com pesquisa (nome, ingrediente, nº de ficha), filtros por família e estado, e ordenação.
- Editor com os campos do modelo: nome do prato, nº ficha (automático), família/grupo, nº doses, tempos de preparação e confeção.
- Tabela de ingredientes: unidade, quantidade (3 casas decimais), preço unitário c/IVA, aproveitamento % opcional e preço de custo calculado.
- Resumo financeiro: custo total, custo por dose, preço recomendado (pelo food cost alvo), preço de venda, margem e food cost real.
- Modo de preparo, observações / empratamento / tipologia, os 14 alergénios, conservação e segurança alimentar, e fotografia do empratamento.
- Escalonamento para qualquer número de doses.
- Exportação: Excel (layout do modelo, com fórmulas), PDF (uma ficha, uma seleção ou todas, com capa e índice), CSV da biblioteca e cópia de segurança JSON (com importação).

## Onde ficam os dados

O site é estático (GitHub Pages) e não tem servidor. As fichas ficam guardadas **no browser de cada dispositivo** (IndexedDB).

- Para não perder fichas, exporte regularmente a **cópia de segurança (.json)** em *Exportar / Importar*.
- Para passar as fichas para outro computador ou telemóvel, importe esse ficheiro lá.
- Limpar os dados do browser apaga as fichas desse dispositivo.

## Publicar no GitHub Pages

1. Coloque `index.html`, `shim.js` e `.nojekyll` na raiz do repositório (ramo `main`).
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, escolha `main` e a pasta `/ (root)`, e guarde.
3. Após um ou dois minutos, o site fica disponível em `https://<organização>.github.io/<repositório>/`.

O repositório tem de ser público para usar o GitHub Pages num plano gratuito.

## Ficheiros

| Ficheiro | Função |
|---|---|
| `index.html` | A aplicação completa (interface, cálculos, exportações, traduções). |
| `shim.js` | Camada de armazenamento local (IndexedDB, com alternativa em localStorage) e transferências. |
| `.nojekyll` | Indica ao GitHub Pages que sirva os ficheiros tal como estão. |

Bibliotecas externas carregadas por CDN: SheetJS 0.18.5 (Excel) e jsPDF 2.5.1 (PDF).
