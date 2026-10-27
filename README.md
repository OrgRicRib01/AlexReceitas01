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

## Onde ficam os dados (partilhados entre dispositivos)

A biblioteca é guardada **no próprio repositório**, em JSON:

- `data/biblioteca.json` — fichas, lista de ingredientes e dados da biblioteca (proprietário, turma…).
- `data/fotos/` — fotografias do empratamento e da preparação.

Todos os dispositivos que abrem o site veem os mesmos dados. Cada browser guarda também uma cópia local, para abrir depressa e funcionar sem rede; as alterações são enviadas quando houver ligação. Se o mesmo registo for alterado em dois dispositivos, fica a versão alterada mais recentemente.

**Ler** não precisa de nada. **Editar** num dispositivo precisa de um token do GitHub, colado uma vez nesse dispositivo (botão de estado no topo → *Ligar este dispositivo*):

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Resource owner*: `OrgRicRib01`. *Repository access*: **Only select repositories** → `AlexReceitas01`.
3. *Permissions → Repository permissions → Contents*: **Read and write**.
4. Copie o token e cole-o no site. Fica guardado só nesse browser; use *Desligar este dispositivo* para o remover.

Cada gravação cria um commit no repositório (histórico completo das alterações). O repositório é público, por isso qualquer pessoa com o endereço pode ler as fichas.

A cópia de segurança (.json) em *Exportar / Importar* continua disponível.

## Preços médios de mercado

Em **Ingredientes → Sincronizar preços médios** escolhe-se o país e aplica-se uma tabela de referência:

- **Portugal**: 167 ingredientes em português (legumes, fruta, carne, peixe, laticínios, mercearia, gorduras, ervas e especiarias, bebidas para cozinhar), com preço por kg, L, unidade ou molho. Ficheiro: `data/precos/PT.json`.
- Fontes: [Ativos.pt — cabaz alimentar](https://www.ativos.pt/cabaz-alimentar/produtos) (mediana de 5 supermercados, 27/10/2026), [Bourmet.pt — comparador de ingredientes](https://bourmet.pt/ingredientes) (preço mais baixo entre Continente, Auchan e Pingo Doce, 08/09/2026) e o cabaz da [DECO PROteste](https://www.dnoticias.pt/2026/10/7/508079-cabaz-alimentar-volta-a-subir-para-25556-euros-na-ultima-semana/) (07/10/2026).
- A sincronização acrescenta os ingredientes que faltam e atualiza o *preço de mercado* dos existentes. Não altera preços fixados à mão nem preços lançados nas fichas; o preço de mercado só é usado como estimativa enquanto o ingrediente não tem preço numa ficha.
- Os preços são valores de referência convertidos a partir do preço da embalagem: confirmar antes de usar em orçamentos. Espanha e Reino Unido ainda não têm tabela.


## Publicar no GitHub Pages

1. Coloque `index.html`, `shim.js` e `.nojekyll` na raiz do repositório (ramo `main`).
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, escolha `main` e a pasta `/ (root)`, e guarde.
3. Após um ou dois minutos, o site fica disponível em `https://<organização>.github.io/<repositório>/`.

O repositório tem de ser público para usar o GitHub Pages num plano gratuito.

## Ficheiros

| Ficheiro | Função |
|---|---|
| `index.html` | A aplicação completa (interface, cálculos, exportações, traduções). |
| `shim.js` | Armazenamento: cópia local no browser e sincronização com `data/biblioteca.json` através da API do GitHub. |
| `data/biblioteca.json` | Os dados da biblioteca (partilhados). |
| `data/fotos/` | As fotografias. |
| `.nojekyll` | Indica ao GitHub Pages que sirva os ficheiros tal como estão. |

Bibliotecas externas carregadas por CDN: SheetJS 0.18.5 (Excel) e jsPDF 2.5.1 (PDF).
