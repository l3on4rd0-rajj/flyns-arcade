# Análise de dependências relacionadas a IP

**Data:** 2026-10-24
**Escopo:** dependências instaladas da Alexandria e caminhos de uso no código local.

## Inventário

| Componente | Versão instalada | Papel | Uso na Alexandria | Risco atual |
|---|---:|---|---|---|
| `ip-range-check` | `0.2.1` | Comparação IP/CIDR | Laboratório opt-in; não participa do login | Corrigido para o caso testado; manter fixado |
| `request-ip` | `3.3.0` | Leitura de cabeçalhos/peer para obter IP | Somente laboratório opt-in | Não confirmado como vulnerável; não usar sozinho para autorização |
| `proxy-addr` | `2.0.7` | Calcula `req.ip`/`req.ips` atrás de proxy | Transitivo de Express; `app.set('trust proxy', 1)` | Versão com advisory para trust subnet IPv4-mapped; caminho específico não usa subnet |
| `ipaddr.js` | `1.9.1` | Parser usado por `proxy-addr` | Transitivo de Express | Parser antigo; revisar junto com `proxy-addr` |
| `ipaddr.js` | `2.5.0` | Parser usado por `ip-range-check` | Transitivo do laboratório | Não é o mesmo código da versão 1.9.1 |
| `forwarded` | `0.2.0` | Divide a cadeia `X-Forwarded-For` | Transitivo de `proxy-addr` | Dados só são confiáveis com proxy confiável |

## Evidência de configuração

O servidor contém `app.set('trust proxy', 1)`. Em um microteste local com Express, uma requisição direta de `127.0.0.1` contendo `X-Forwarded-For: 198.51.100.10` produziu:

```json
{"remote":"127.0.0.1","ip":"198.51.100.10","ips":["198.51.100.10"]}
```

Isso demonstra que a configuração confia no primeiro salto e permite que o valor do cabeçalho influencie `req.ip` quando o processo é alcançável diretamente. O bind padrão da Alexandria foi limitado a `127.0.0.1`, reduzindo a exposição local; em produção, a configuração precisa refletir a topologia real do reverse proxy.

## O que não foi encontrado

Não foram encontrados na aplicação principal usos de `dns.lookup`, `http.request`, `https.request`, `axios`, `got` ou `fetch` server-side com URL controlada pelo usuário. Os `fetch` encontrados estão no frontend ou no healthcheck do Docker. Portanto, não há evidência atual de um sink SSRF que consuma uma classificação de IP.

## Advisory relevante

O `proxy-addr@2.0.7` aparece em advisories públicos por aceitar uma trust subnet IPv4-mapped com prefixo IPv4 curto, como `::ffff:10.0.0.0/8`, podendo confiar endereços indevidos; a correção indicada é `2.0.8`. A Alexandria usa `trust proxy` numérico (`1`), não essa forma de subnet, então o advisory não deve ser reportado como explorável na aplicação sem reproduzir a configuração afetada. Consulte [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).

O `ip-range-check@0.2.0` foi removido da aplicação e substituído por `0.2.1`; a diferença de normalização foi registrada em [security-lab-validation.md](./security-lab-validation.md).

## Matriz executada

### `ipaddr.js@1.9.1`

- `127.0.0.1` → normaliza para `127.0.0.1`, faixa `loopback`.
- `127.1` → rejeita como formato inválido.
- `2130706433` → normaliza para `127.0.0.1`, faixa `loopback`.
- `0x7f000001` → normaliza para `127.0.0.1`, faixa `loopback`.
- `::ffff:127.0.0.1` → reconhece como IPv4-mapped.

### `request-ip@3.3.0`

Com um peer local sintético, os headers `X-Client-IP`, `X-Forwarded-For` e `X-Real-IP` foram aceitos na ordem documentada. Isso é comportamento funcional, não uma prova de spoofing: a confiança depende do proxy que colocou o header.

Na instância temporária da Alexandria, com peer real `127.0.0.1`:

- `X-Forwarded-For: 198.51.100.10` foi retornado por `request-ip` como `198.51.100.10`.
- `X-Forwarded-For: 127.1` foi rejeitado como forma inválida e o resultado voltou para `127.0.0.1`.

Isso confirma que a biblioteca aceita headers de proxy válidos, mas não aceitou a representação abreviada usada no teste de `ip-range-check@0.2.0`. Não foi demonstrado bypass pelo `request-ip`.

### `proxy-addr@2.0.7`

Com peer sintético `198.51.100.10` e `X-Forwarded-For: 203.0.113.77`:

| Trust configurado | Cliente calculado |
|---|---|
| `127.0.0.1/32` | `198.51.100.10` |
| `10.0.0.0/8` | `198.51.100.10` |
| `::ffff:10.0.0.0/8` | `203.0.113.77` |

O terceiro resultado reproduz o comportamento descrito no advisory de `proxy-addr`: o peer externo foi tratado como confiável quando a subnet IPv4-mapped foi escrita com prefixo IPv4 curto. A Alexandria não usa essa forma; usa o número `1` em `trust proxy`, então este caso deve ser tratado como risco da dependência/configuração potencial, não como exploração confirmada da Alexandria.

## Hipótese adicional: desacordo entre `proxy-addr` e consumidor de URL

Um corpus local também mostrou:

| Entrada no header | `request-ip` | `proxy-addr` | `ip-range-check@0.2.1` | `new URL('http://' + entrada)` |
|---|---|---|---:|---|
| `127.1` | volta ao peer | retorna `127.1` | `true` para loopback | normaliza para `127.0.0.1` |
| `2130706433` | volta ao peer | retorna `2130706433` | `true` para loopback | normaliza para `127.0.0.1` |
| `127.0.0.1:80` | retorna `127.0.0.1` | retorna token com porta | `false` se usado bruto | hostname `127.0.0.1` |
| `not-an-ip` | volta ao peer | retorna token bruto | `false` | hostname textual |

Esse resultado só se torna um bypass se um consumidor fizer a sequência insegura `proxy-addr -> ip-range-check(raw) -> new URL()/conexão`. A Alexandria não possui esse fluxo, então a hipótese não é uma vulnerabilidade confirmada no app nem no `proxy-addr` isoladamente. Ela é uma regressão de teste útil para qualquer futuro código que transforme `req.ip` em destino de rede.

## Reprodução da cadeia completa em laboratório

O script `npm run test:ip-chain` cria um serviço sintético somente em `127.0.0.1`, injeta um peer externo e um `X-Forwarded-For` com porta, aplica a trust subnet IPv4-mapped afetada, valida o valor bruto e então deixa o parser de URL normalizá-lo. O resultado esperado é:

- `proxy-addr` retorna o token bruto;
- `ip-range-check` não bloqueia o token com porta;
- `new URL()` resolve o hostname para `127.0.0.1`;
- somente o sink local recebe a requisição e devolve o marcador sintético.

Isso demonstra a classe de desacordo entre validador e consumidor, mas não atribui automaticamente a falha ao `request-ip` nem à Alexandria. Para isso, a mesma sequência teria de existir em um fluxo real do produto.

## Recomendações

1. Atualizar `proxy-addr` para `>=2.0.8` por override/lockfile quando compatível com Express.
2. Manter o servidor inacessível diretamente quando `trust proxy` estiver habilitado, ou restringir a confiança aos IPs/CIDRs reais do proxy.
3. Não usar `request-ip` ou `req.ip` isoladamente para autorização, SSRF ou allowlists.
4. Reexecutar `npm audit` quando o acesso ao registry estiver funcional; a tentativa local falhou por erro de certificado TLS.

## Avaliação de novidade para CVE

Até esta etapa, não foi identificado um vetor novo atribuível a `request-ip`:

- a aceitação de `X-Forwarded-For`/`X-Client-IP` sem conhecimento da topologia já está documentada na issue aberta [#25 do projeto](https://github.com/pbojinov/request-ip/issues/25);
- a precedência dos headers e o retorno do primeiro IP válido estão descritos no README do projeto;
- o caso IPv4-mapped de `proxy-addr` já possui advisory/CVE próprio;
- o bypass de normalização do `ip-range-check@0.2.0` já foi corrigido em `0.2.1` e não é novo;
- a cadeia artificial `proxy-addr -> ip-range-check -> new URL` demonstra uma composição insegura, mas não uma nova falha isolada da biblioteca nem um fluxo existente na Alexandria.

**Conclusão de triagem:** não há base suficiente para propor uma nova CVE neste momento. Há material para hardening da aplicação e para uma validação independente dos advisories existentes. Um novo reporte só seria justificável se surgisse uma causa raiz diferente, versões não cobertas ou impacto em um fluxo real sem depender das condições já documentadas.

## Triagem das bibliotecas recomendadas

Foi feita uma segunda triagem, priorizando as bibliotecas Node que podem participar do mesmo tipo de decisão de confiança:

| Biblioteca | Situação no ambiente | Resultado da triagem |
|---|---|---|
| `request-ip@3.3.0` | instalado e testado | aceita headers conforme a ordem documentada; não foi demonstrada nova falha isolada. A própria issue [#25](https://github.com/pbojinov/request-ip/issues/25) alerta que headers não devem ser tratados como prova de origem sem uma topologia confiável. |
| `ip-range-check@0.2.1` | instalado e testado | o caso de normalização observado em `0.2.0` não reproduziu em `0.2.1`; a correção é conhecida e não constitui nova CVE. |
| `ipaddr.js@1.9.1` e `2.5.0` | transitivos e testados | reconhecem IPv4-mapped e rejeitam algumas formas abreviadas; não foi encontrado, nesta campanha, um advisory novo atribuível ao parser isolado. |
| `proxy-addr@2.0.7` | transitivo e testado | reproduz o advisory de subnet IPv4-mapped com prefixo curto; a versão corrigida indicada é `2.0.8`. |
| `ip-address` | não é dependência da Alexandria | a consulta oficial encontrou advisories existentes para classificação incorreta de IPv4-mapped/NAT64 (`CVE-2026-54272`, corrigido em `10.2.1`) e para custo de parsing de entradas longas (`CVE-2026-101911`, corrigido em `10.7.1`). A instalação isolada para comparar versões ficou pendente no registry e não foi incorporada ao app. |
| `python-ipware`, `netaddr`, `Werkzeug` e `ipaddress` | não são dependências da Alexandria | não há evidência de uso desses parsers no código do app; devem ser avaliados em ambiente Python separado, sem misturar dependências com o runtime Node. |
| `netipx`, `ipnet` e Apache Commons Validator | não instalados; Go/Rust ausentes | ficam fora da execução local atual. A análise deve ser feita em toolchains próprias e somente após fixar versões. |

Os dois advisories de `ip-address` são relevantes para a hipótese, mas não são candidatos a nova CVE: já possuem causa raiz, versões afetadas, versões corrigidas e PoCs publicados no GitHub Advisory Database ([CVE-2026-54272](https://github.com/advisories/GHSA-22jq-vg5j-6vgg), [CVE-2026-101911](https://github.com/advisories/GHSA-h3mg-xc3c-68pw)).

### Critério para continuar a campanha

Cada biblioteca deve ser comparada com o mesmo corpus local, sem DNS ou rede externa:

1. formas IPv4 alternativas (`127.1`, inteiro decimal, hexadecimal e octal);
2. IPv4-mapped e NAT64 (`::ffff:127.0.0.1`, `64:ff9b::7f00:1`);
3. CIDR equivalente escrito em IPv4 e IPv6-mapped;
4. entradas com porta, whitespace, múltiplos headers e valores inválidos;
5. entradas grandes, com limite explícito para não transformar o teste em DoS;
6. comparação entre a decisão do parser e o destino efetivamente usado pelo consumidor.

Uma divergência só será candidata a reporte se houver: (a) comportamento inesperado documentável, (b) impacto de segurança em uma integração real, (c) versão afetada não coberta por advisory existente e (d) reprodução mínima contra a versão publicada.

### Spot-check do Python disponível

Mesmo sem instalar pacotes adicionais, o módulo padrão `ipaddress` do Python 3.12 foi comparado no mesmo corpus. Ele reconhece `127.0.0.1` e `::ffff:127.0.0.1` como loopback/privado, rejeita as formas `127.1`, inteiro decimal, hexadecimal e octal, e não classifica `64:ff9b::7f00:1` como privado ou loopback. O último resultado, isoladamente, não é uma falha: a classificação de um endereço NAT64 depende do prefixo e da política da rede que fará a tradução; o consumidor precisa definir explicitamente essa política.
