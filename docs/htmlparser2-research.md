# Pesquisa exploratÃ³ria: `htmlparser2`

## Escopo

Foi criado um laboratÃ³rio isolado em `research/htmlparser2-lab` para investigar divergÃªncias entre `htmlparser2` e o parser HTML5 `parse5`, com foco em atributos URI, namespaces SVG, NULs e elementos de texto bruto. O alvo foi escolhido porque o repositÃ³rio declara canal de reporte privado e nÃ£o lista advisories publicados na data da pesquisa:

- [polÃ­tica de seguranÃ§a do htmlparser2](https://github.com/fb55/htmlparser2/security);
- [documentaÃ§Ã£o e limitaÃ§Ãµes do parser](https://github.com/fb55/htmlparser2);
- `htmlparser2@12.0.0` e `parse5@8.0.1`.

Nenhum HTML foi renderizado ou executado. Os testes foram offline, sem rede, com limite de 4 KiB por caso na rodada de mutaÃ§Ã£o.

## Resultados

### Diferencial bÃ¡sico

O corpus inicial teve 20 casos, com limite de 64 KiB e timeout de 2 segundos por worker. Foram observadas quatro divergÃªncias restantes em `htmlparser2@12.0.0`:

1. NUL em valor de `href`: `htmlparser2` preserva `\\u0000`; `parse5` substitui por `U+FFFD`;
2. `xlink:href`: `htmlparser2` preserva o nome prefixado; `parse5` expÃµe `href` com namespace SVG/XLink;
3. normalizaÃ§Ã£o de CRLF dentro de atributo;
4. inserÃ§Ã£o de `tbody` em tabela.

As alteraÃ§Ãµes de `textarea`/`xmp` observadas na versÃ£o antiga desapareceram na versÃ£o 12, coerentemente com o changelog upstream.

### MutaÃ§Ã£o orientada a seguranÃ§a

Foram processados 648 casos determinÃ­sticos envolvendo `href`, `xlink:href`, `action`, `formaction`, `src`, entidades HTML, NUL, CR/LF, SVG e fechamentos malformados.

Resultado:

- 149 divergÃªncias de AST;
- 11 divergÃªncias de atributos consideradas sensÃ­veis;
- 0 findings na saÃ­da do `sanitize-html@2.18.0`;
- 0 timeout, falha ou travamento;
- tempo total aproximado: 103 ms.

O caso mais relevante Ã© a diferenÃ§a de representaÃ§Ã£o de `xlink:href`. Ela exige que consumidores tratem o nome prefixado e o namespace equivalente como atributos URI. Isso pode ser um risco de integraÃ§Ã£o se um consumidor implementar uma allowlist incorreta, mas nÃ£o Ã© uma vulnerabilidade demonstrada no `htmlparser2` isolado. O sanitizador corrigido removeu os valores JavaScript nos casos testados.

## ClassificaÃ§Ã£o

NÃ£o foi encontrada uma nova CVE nem uma causa raiz independente. O alvo deve ser encerrado nesta rodada como **hipÃ³tese nÃ£o confirmada**. Para reabrir a pesquisa seria necessÃ¡rio escolher um consumidor concreto que trate `xlink:href` ou NUL de forma insegura e demonstrar impacto nesse consumidor, sem reapresentar advisories jÃ¡ publicados.

Scripts reprodutÃ­veis:

- `node research/htmlparser2-lab/compare-parsers.mjs`;
- `node research/htmlparser2-lab/security-fuzz.mjs`.

Matriz adicional de sanitizacao: 1.320 combinacoes de tags, atributos URI, `srcset`, `imagesrcset`, entidades HTML, NUL e CR/LF foram sanitizadas e reparseadas com `parse5`. Foram encontrados 0 esquemas perigosos e 0 atributos de evento na saida.
