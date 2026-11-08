# Revisão de segurança das dependências

**Projeto:** Alexandria / Arcadia Vault
**Data:** 2026-10-24
**Escopo:** `package.json`, `package-lock.json`, árvore instalada, uso das bibliotecas no código e auditoria npm.

## Resultado executivo

Não foi encontrada uma causa raiz nova que justifique uma CVE contra uma dependência. Os comportamentos de parsing de IP já correspondem a advisories existentes. A auditoria encontrou problemas conhecidos e dois riscos de composição relevantes para o projeto:

1. o `Dockerfile` copia todos os `node_modules` da etapa de build para a imagem final, incluindo dependências de desenvolvimento vulneráveis;
2. `express-rate-limit` depende de `ip-address@10.3.1`, que está dentro de vários intervalos afetados, embora os métodos vulneráveis não sejam chamados pelo caminho padrão usado na Alexandria.

Esses pontos justificam atualização e redução da imagem, mas não são uma nova descoberta de CVE.

## Inventário relevante

| Dependência instalada | Caminho | Uso no projeto | Avaliação |
|---|---|---|---|
| `express@5.2.1` | direta | servidor HTTP | carrega `body-parser`, `qs` e `proxy-addr` com advisories existentes |
| `express-rate-limit@8.6.1` | direta | limite global de requisições | depende de `ip-address@10.3.1`; a configuração usa `req.ip` |
| `ip-address@10.3.1` | `express-rate-limit` | geração de chave IPv6 do rate limiter | versão afetada por advisories existentes; alcance limitado no caminho atual |
| `proxy-addr@2.0.7` | `express` | cálculo de `req.ip` | advisory conhecido para subnet IPv4-mapped com prefixo curto |
| `multer@2.2.0` | direta | upload administrativo | vários advisories de DoS já publicados; rota exige administrador |
| `nodemailer@9.0.3` | direta | MFA e recuperação de senha | advisories conhecidos no parser de endereços e acesso a conteúdo |
| `zod@4.4.3` | direta | validação de corpos HTTP | advisory conhecido de exaustão de memória; os schemas atuais são pequenos e não usam coleções aninhadas |
| `@prisma/client@6.19.3` / `prisma@6.19.3` | direta | acesso e inicialização do banco | alerta transitivo em `deepmerge-ts`; não há entrada HTTP que forneça configuração Prisma |

## Auditoria npm

Com `NODE_OPTIONS=--use-system-ca`, `npm audit --json` retornou:

```text
total: 24
critical: 4
high: 17
moderate: 2
low: 1
```

Considerando somente dependências de produção, o resultado foi 14 entradas. O número bruto não equivale ao número de vulnerabilidades exploráveis na aplicação: várias entradas são transitivas, de desenvolvimento ou dependem de uma API que Alexandria não utiliza.

## Achados por dependência

### `ip-address@10.3.1`

O pacote aparece por meio de `express-rate-limit@8.6.1`. A auditoria lista advisories para classificação de link-local, NAT64, comparação entre famílias, parsing de entradas longas e identificadores de zona. Esses problemas já estão registrados, incluindo [CVE-2026-101912](https://github.com/advisories/GHSA-j6r3-76f7-8jcv), [CVE-2026-101913](https://github.com/advisories/GHSA-rpw4-54j3-4h4q) e [CVE-2026-101911](https://github.com/advisories/GHSA-h3mg-xc3c-68pw).

Na versão instalada do `express-rate-limit`, o caminho é:

```text
request.ip
  -> node:net.isIPv6(ip)
  -> new Address6(ip)
  -> is4(), to4() ou networkForm()
```

O rate limiter não chama `isLinkLocal()` nem `isInSubnet()`. Além disso, a validação `node:net.isIPv6()` ocorre antes do construtor e rejeita as entradas longas ou com zona usadas nos advisories. Portanto, a presença da versão afetada é um problema de atualização, mas não foi demonstrada exploração dessa advisory através do uso padrão da Alexandria.

### `multer@2.2.0`

Há advisories conhecidos para DoS por nomes de campos multipart, encerramento de uploads, índices de arrays e `fileFilter`, como [CVE-2026-77078](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) e [CVE-2026-113872](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

O projeto usa `multer` apenas depois de `authenticate` e `adminOnly`, o que reduz a exposição a usuários não autenticados. Ainda assim, o upload permite até 8 GB e define `files`, mas não define limites explícitos para `fields`, `fieldSize`, `parts` e `headerPairs`. Isso merece hardening e atualização; repetir os PoCs publicados não seria uma nova CVE.

#### ReDoS especificamente

Não encontrei ReDoS no `multer` instalado nem nas expressões regulares do filtro da Alexandria. Os padrões usados para extensões e MIME type são simples, ancorados e sem quantificadores aninhados. Os advisories atuais do `multer` são falhas de parser/stream e condições de corrida que podem causar crash, vazamento de descritores ou arquivos órfãos; não são ReDoS baseado em retrocesso de regex. A versão instalada `2.2.0` está dentro dos intervalos afetados publicados, portanto o risco conhecido existe, mas não é uma nova hipótese de ReDoS.

### `nodemailer@9.0.3`

A auditoria lista problemas conhecidos de `addressparser`, validação de domínio, listas de destinatários e DoS, incluindo [GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2). Alexandria envia para endereços armazenados no banco; o endereço é informado pelo usuário no cadastro, mas passa por `z.email()` antes de ser persistido. Não foi identificado no projeto um parâmetro que permita ao cliente escolher diretamente `subject`, `html`, `text` ou opções de transporte.

Isso reduz a chance de explorar os caminhos mais perigosos, mas não elimina o motivo para atualizar o pacote e testar endereços adversariais em uma cópia isolada.

### `zod@4.4.3`

O advisory [CVE-2023-54404](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) afeta versões anteriores a `4.6.6`. A aplicação limita JSON a 32 KB e usa schemas planos, sem `z.array()` ou objetos recursivos nos endpoints ativos. O risco conhecido não foi convertido em um DoS demonstrável no fluxo atual, mas a dependência deve ser atualizada quando compatível.

### `express`, `body-parser`, `qs` e `proxy-addr`

São alertas transitivos já conhecidos. `express.json()` está limitado a 32 KB e a aplicação não habilita `express.urlencoded({ extended: true })`, reduzindo a relevância dos alertas específicos de `qs`. O caso de `proxy-addr` já foi reproduzido anteriormente e depende da configuração IPv4-mapped incorreta que não está presente no projeto.

## Insight de composição: rate limit e confiança no proxy

O rate limiter usa `req.ip`. Alexandria configura `app.set('trust proxy', 1)`. Isso é correto somente quando existe exatamente um proxy reverso confiável na frente do processo. Se a aplicação for exposta diretamente, o cliente pode fornecer `X-Forwarded-For` e variar a chave do rate limiter. Isso é uma falha de configuração/topologia da aplicação, não uma CVE nova em `express-rate-limit`.

## Imagem de produção contém dependências de desenvolvimento

O `Dockerfile` executa `npm ci` na etapa de build e depois copia todo `/app/node_modules` para a etapa runtime. Assim, pacotes usados apenas para desenvolvimento — `vite`, `nodemon`, `concurrently`, `shell-quote`, `postcss` e outros — permanecem na imagem final e entram na auditoria de runtime.

Isso amplia a superfície de supply chain e explica parte dos alertas críticos do relatório completo. A correção estrutural é instalar dependências de produção separadamente na etapa final ou executar `npm ci --omit=dev` nessa etapa, mantendo o build em uma camada anterior.

## Conclusão sobre uma nova CVE

Nenhum candidato novo foi confirmado. Os vetores concretos encontrados pertencem a advisories existentes, ou dependem de uma composição/configuração específica da Alexandria. O melhor resultado desta revisão é um conjunto de ações de atualização e isolamento:

1. atualizar `multer`, `zod`, `nodemailer`, `ip-address` transitivo e `proxy-addr` conforme as versões corrigidas disponíveis;
2. reduzir limites de multipart além do limite de arquivo;
3. corrigir a instalação de dependências na imagem runtime;
4. configurar `trust proxy` com a topologia real ou removê-lo quando a API estiver diretamente exposta;
5. repetir a auditoria após as atualizações e somente investigar uma CVE se surgir uma causa raiz não coberta pelos advisories existentes.

## Triagem específica de ReDoS

O candidato que mais merece uma revisão independente é `request-ip@3.3.0`. O arquivo `lib/is.js` usa uma regex IPv6 manual com lookaheads, alternâncias e backreference, e não foi localizado advisory público específico de ReDoS para essa biblioteca. Um microbenchmark local com entradas inválidas de 128 a 16.000 bytes mostrou custo baixo e aproximadamente linear, sem crescimento explosivo. Isso reduz a hipótese, mas não constitui prova formal de ausência de ReDoS.

O segundo ponto é `append-field`, transitivo de `multer`. O parser de nomes com colchetes executa vários `substring()` e passos sucessivos; isso pode ser analisado como complexidade algorítmica, mas não há uma regex com retrocesso catastrófico. O limite padrão de nome de campo do Busboy também reduz a entrada individual. Os problemas de Multer já publicados cobrem a superfície de multipart mais diretamente.

`path-to-regexp@8.4.2`, `semver`, `minimatch` e `brace-expansion` não são bons candidatos novos nesta árvore: os advisories conhecidos são de versões antigas ou já aparecem na auditoria, e alguns são dependências de desenvolvimento. `nodemailer` possui DoS quadrático no `addressparser`, mas esse vetor já tem advisories públicos e correções; não deve ser reapresentado como descoberta nova.

### POC offline executada

O comando `npm run test:redos-fuzz` executou workers isolados, sem rede e sem requisições à Alexandria:

- `request-ip`: 10.080 entradas determinísticas, incluindo padrões IPv6 malformados de até 16.384 bytes; tempo total de aproximadamente 175 ms e pior caso individual de aproximadamente 0,57 ms.
- `append-field`: 15 casos de profundidade/largura de nomes multipart; tempo total de aproximadamente 4 ms e sem crescimento anormal.
- limite por worker: 5 segundos; nenhum worker foi encerrado por timeout.

O corpus também cobriu cadeias `X-Forwarded-For` inválidas de até aproximadamente 14 KB; o custo observado cresceu de forma aproximadamente linear com o número de itens. O resultado não prova ausência universal de ReDoS, mas não fornece evidência suficiente para um reporte contra `request-ip` ou `append-field`.

O comando `npm run test:redos-libraries` ampliou a revisão para os parsers não relacionados a IP:

- `nodemailer@9.0.3`: o parser de endereços mostrou crescimento compatível com o problema quadrático já publicado, mas em tamanhos controlados e sem novo comportamento além dos advisories existentes;
- `zod@4.4.3`: `z.email()` permaneceu abaixo de 0,1 ms para entradas próximas ao limite JSON da aplicação;
- `qs@6.15.3`, `negotiator@1.0.0`, `content-disposition@1.1.0` e `semver@7.8.5`: não apresentaram crescimento superlinear nos corpora controlados;
- `path-to-regexp@8.4.2`, `minimatch@10.2.5` e `brace-expansion@5.0.8` foram classificados principalmente por versão/caminho de uso: os advisories conhecidos são públicos e, no caso de `minimatch`/`brace-expansion`, a cadeia é de desenvolvimento via `nodemon`.
### Rodada dedicada de ReDoS sem parsers de IP

Para separar a hipÃ³tese de ReDoS do estudo anterior, foi executado `npm run test:redos-focused`. O teste nÃ£o inicia a API, nÃ£o faz requisiÃ§Ãµes HTTP e nÃ£o usa rede: cada biblioteca roda em um worker isolado, com entrada mÃ¡xima de 32 KiB e timeout de 3 segundos.

Resultado observado:

- `nodemailer@9.0.3`: endereÃ§os distintos e comentados atÃ© 512 itens concluÃ­ram em atÃ© aproximadamente 4,2 ms no corpus. O comportamento Ã© compatÃ­vel com a complexidade quadrÃ¡tica jÃ¡ documentada em [GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2); nÃ£o Ã© uma nova descoberta.
- `zod@4.4.3`: entradas invÃ¡lidas de email e senha atÃ© aproximadamente 32 KiB permaneceram abaixo de 0,2 ms por caso; nÃ£o apareceu ReDoS.
- `qs@6.15.3`: profundidade atÃ© 100 e 2.000 pares concluÃ­ram sem timeout ou crescimento superlinear observÃ¡vel. A aplicaÃ§Ã£o tambÃ©m nÃ£o habilita `express.urlencoded({ extended: true })`.
- `path-to-regexp@8.4.2`: correspondÃªncia de parÃ¢metro atÃ© aproximadamente 16 KiB permaneceu submilissegundo. O ReDoS pÃºblico de `path-to-regexp` se refere a versÃµes antigas, nÃ£o Ã  versÃ£o instalada ([GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2)).
- `minimatch@10.2.5`: padrÃ£o com globstar e caminhos atÃ© aproximadamente 16 KiB concluÃ­ram em atÃ© aproximadamente 1,9 ms apÃ³s o aquecimento. A cadeia Ã© usada por `nodemon` em desenvolvimento, nÃ£o por uma rota de produÃ§Ã£o.
- `brace-expansion@5.0.8`: expansÃµes aninhadas atÃ© profundidade 10 concluÃ­ram em menos de 0,5 ms; tambÃ©m Ã© uma dependÃªncia de desenvolvimento nessa Ã¡rvore.
- `content-disposition@1.1.0`: nomes de arquivo atÃ© aproximadamente 16 KiB concluÃ­ram em menos de 0,5 ms; nÃ£o houve sinal de retrocesso catastrÃ³fico.

Nenhum worker excedeu o timeout. Portanto, esta rodada nÃ£o confirma uma nova CVE de ReDoS nas dependÃªncias testadas. O Ãºnico comportamento de complexidade suspeita continua sendo o do `nodemailer`, mas ele jÃ¡ possui advisory e correÃ§Ã£o pÃºblicos. Para a Alexandria, a medida adequada Ã© atualizar as dependÃªncias vulnerÃ¡veis e manter limites de entrada; nÃ£o hÃ¡ base tÃ©cnica, nesta rodada, para reportar uma nova falha aos mantenedores.
### Rodada end-to-end local pela Alexandria

Para validar a explorabilidade no fluxo HTTP real, foi executado `npm run test:redos-http` contra `http://127.0.0.1:3000`. O teste foi restrito a localhost, usou no mÃ¡ximo 32 KiB por requisiÃ§Ã£o, timeout de 3 segundos e nÃ£o acionou envio de email externo.

Os caminhos exercitados foram:

- `GET /api/roms` com valores de query de 64 a 16.000 bytes, chaves aninhadas atÃ© profundidade 100 e 2.000 pares;
- `POST /api/auth/login` com emails invÃ¡lidos de 64 a 16.000 bytes, atravessando o parser JSON e o schema Zod real;
- `POST /api/roms` multipart sem credencial, confirmando que a autenticaÃ§Ã£o bloqueia a rota antes do upload administrativo.

Todos os casos concluÃ­ram sem timeout: as consultas retornaram 200, os logins invÃ¡lidos retornaram 401 e o multipart sem autenticaÃ§Ã£o retornou 401. O caso de 2.000 parÃ¢metros levou aproximadamente 30 ms; o maior valor de query, aproximadamente 18 ms; e o maior email invÃ¡lido, aproximadamente 4 ms. Isso nÃ£o demonstra ReDoS explorÃ¡vel no fluxo HTTP da Alexandria.

O Nodemailer nÃ£o foi acionado por uma rota de login vÃ¡lida nesta rodada, pois isso poderia enviar email real. O teste direto isolado continua sendo suficiente para confirmar que seu comportamento quadrÃ¡tico Ã© o advisory jÃ¡ publicado, mas nÃ£o uma nova CVE.
### Matriz autenticada de multipart

Com um usuario ADMIN local e MFA validado, a rota real `POST /api/roms` foi exercitada atraves do Multer/Busboy:

- 500 campos planos, aninhados e repetidos ficaram na mesma ordem de grandeza, entre aproximadamente 20 e 100 ms;
- 2.000 campos ficaram entre aproximadamente 216 e 224 ms, sem diferenca relevante entre os tres formatos;
- 5.000 campos aninhados retornaram `400` em aproximadamente 574 ms;
- 10.000 campos aninhados retornaram `400` em aproximadamente 1.085 ms;
- a API continuou saudavel depois da carga (`GET /api/health` retornou `200`);
- nomes de arquivo de 1 e 4 KiB retornaram `400` por validacao do schema; a partir de 8 KiB o Busboy retornou `Malformed part header` em menos de 10 ms, resultando em `500` pelo handler generico.

Os tempos dos campos cresceram aproximadamente de forma linear, e nao houve timeout ou retrocesso catastrofico. O ponto concreto para a Alexandria e de configuracao: `multer` e usado sem limites explicitos para `fields`, `parts`, `fieldNameSize` e `headerPairs`. Recomenda-se definir limites baixos e mapear erros do Multer para `4xx`. Isso e hardening da aplicacao e nao evidencia uma nova CVE em `multer`, `busboy` ou `append-field`.
## SAST: `qs` e `multer`

### `qs@6.15.3`

O codigo instalado usa limites padrao (`depth=5`, `parameterLimit=1000`, `arrayLimit=20`) e rejeita prototipos por padrao. A analise estatica nao encontrou regex com retrocesso catastrofico: o parser percorre a string, separa pares e processa segmentos de colchetes com contadores e `indexOf`.

O ponto sensivel esta na composicao do Express: o parser `extended` chama `qs.parse(..., { allowPrototypes: true })`. Isso permite chaves que coincidem com nomes de propriedades herdadas, embora a versao instalada continue bloqueando o caminho especial `__proto__` e os testes locais nao demonstraram poluicao global. Deve-se evitar `allowPrototypes: true` quando a aplicacao controlar diretamente a configuracao.

Na Alexandria, `server.js` mantem o parser de query do Express no modo `simple` e nao habilita `express.urlencoded({ extended: true })`. As rotas usam `express.json()`, portanto `qs` nao foi demonstrado como alcançavel por uma entrada HTTP ativa. Os advisories do `npm audit` para `qs` sao publicos ([GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) e [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)); nao constituem uma nova descoberta deste projeto.

### `multer@2.2.0` / `busboy@1.6.0` / `append-field@1.0.0`

O caminho ativo esta em `routes/roms.js`. Pontos positivos: `authenticate` e `adminOnly` executam antes do upload; os nomes de pasta sao escolhidos por whitelist; `safeBaseName` remove separadores e caracteres fora da lista; os regexes de extensao sao simples e ancorados; e o numero de arquivos esta limitado a dois.

Achados SAST:

1. `limits` define somente `fileSize` e `files` (8 GiB e 2 arquivos). Nao ha limites para `fields`, `parts`, `fieldNameSize`, `fieldSize`, `headerPairs` ou `fieldNestingDepth`. Isso permite consumo desnecessario de CPU/memoria por muitos campos e permite que o limite de arquivo seja muito maior que a capacidade razoavel do servidor.
2. O middleware global transforma erros genericos do Busboy e do `fileFilter` em HTTP 500. O teste autenticado reproduziu `Malformed part header` para filename a partir de aproximadamente 8 KiB; isso deve ser 4xx, nao erro interno.
3. `append-field` percorre cada segmento do nome e usa regexes ancoradas; nao foi identificado ReDoS. A matriz autenticada mostrou crescimento aproximadamente linear e comportamento semelhante entre campos planos, aninhados e repetidos.
4. A limpeza de arquivos rejeitados usa `fs.unlink` sem aguardar ou reportar erro. Isso nao e ReDoS, mas pode deixar residuos temporarios se o processo for interrompido durante a limpeza.

Os advisories do `npm audit` para Multer sao publicos e cobrem DoS por nomes de campo, indices, uploads abortados, file descriptors e escritas orfas ([GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4), [GHSA-qfvm-cv95-jqjf](https://github.com/advisories/GHSA-qfvm-cv95-jqjf)). A auditoria local nao demonstra uma causa raiz nova contra a dependencia.

### Classificacao

- `qs`: risco ativo baixo no estado atual, porque o caminho `extended` nao esta habilitado; manter o modo `simple` ou configurar limites explicitamente se a aplicacao mudar.
- `multer`: hardening recomendado de prioridade alta na rota administrativa; definir limites de campos/partes/nome/profundidade, reduzir `fileSize` e mapear erros do parser para respostas 4xx.
- Nova CVE: nao confirmada. Os problemas de dependencia listados pelo audit ja possuem advisories publicos; os demais achados sao de configuracao e tratamento de erros da Alexandria.
## Revisao geral das demais dependencias

### Dependencias ativas no caminho HTTP

- `express@5.2.1` e `body-parser`: ativos no servidor. O JSON tem limite de 32 KiB; nao ha parser urlencoded estendido. O audit aponta o advisory conhecido de corpo comprimido/trailing bytes via `body-parser`/`qs`, mas nao foi demonstrada exploracao nova no caminho atual.
- `zod@4.4.3`: usado nos schemas de autenticacao, perfil, usuarios e metadata. Os schemas sao planos e o corpo JSON tem limite global; o advisory de colecoes grandes nao foi alcançado pelos endpoints revisados.
- `jsonwebtoken@9.0.3`: a verificacao usa segredo HMAC e nao aceita entrada do algoritmo pelo cliente. O risco principal nao e da biblioteca: `routes/auth.js` e `middlewares/roles.js` usam `arcadia-dev-secret` como fallback quando `JWT_SECRET` nao existe. Em qualquer ambiente exposto, a inicializacao deveria falhar sem um segredo forte.
- `bcryptjs@3.0.3`: custo 12 no cadastro e reset, com bloqueio apos tentativas de login. Nao foi observado parser ou regex de entrada associado a ReDoS.
- `nodemailer@9.0.3`: caminho de MFA e recuperacao de senha ativo, mas destinatario, assunto e corpo sao construidos pela aplicacao; a entrada do usuario nao controla uma lista arbitraria de destinatarios. Os advisories sao conhecidos e devem ser tratados por atualizacao e restricao de uso.
- `express-rate-limit@8.6.1`: ativo globalmente. A eficacia depende da topologia de proxy configurada em `trust proxy`; isso e risco de composicao, nao uma falha nova da dependencia.
- `helmet@8.3.0` e `cors@2.8.6`: configuracao aplicada globalmente; CORS usa uma origem fixa. `unsafe-inline` na CSP reduz a protecao contra XSS, mas e uma decisao de configuracao da aplicacao.
- `@prisma/client@6.19.3`: acesso por queries estruturadas; nao foi encontrado `queryRaw` no caminho revisado. O advisory de `deepmerge-ts`/Prisma ocorre em configuracao e inicializacao, nao por dados de requisicao neste projeto.

### Dependencias presentes, mas fora do caminho de ataque atual

- `qs@6.15.3`: transitiva; Express permanece em query parser `simple` e nao usa `express.urlencoded({ extended: true })`.
- `request-ip@3.3.0` e `ip-range-check@0.2.1`: usados pelo laboratorio de seguranca condicional, que so e montado com `SECURITY_LAB_ENABLED=true`.
- `swagger-ui-express@5.0.1`: a documentacao e publica, mas nao foi identificado processamento de entrada do usuario que leve a execucao no servidor. Deve ser protegida ou desabilitada fora de ambientes de pesquisa.
- `react`, `react-dom`, `react-router` e `three`: superficie de frontend; nao processam requisicoes diretamente no servidor. A autorizacao continua precisando ser aplicada no backend, o que ocorre nas rotas administrativas ativas.
- `dotenv`: carrega configuracao local; o risco esta na ausencia de validacao de variaveis obrigatorias e nos fallbacks inseguros, nao no parser isolado.

### Supply chain e composicao

O `npm audit --omit=dev` atual reportou 14 entradas: 2 moderadas, 10 altas e 2 criticas, concentradas em `body-parser/qs`, `deepmerge-ts/Prisma`, `multer`, `nodemailer`, `proxy-addr` e `zod`. O numero nao representa 14 caminhos exploraveis: varios sao transitivos, conhecidos ou fora do caminho ativo.

O Dockerfile copia todo `node_modules` da etapa de build para o runtime. Isso coloca ferramentas de desenvolvimento e seus advisories na imagem final. A separacao de `npm ci --omit=dev` no runtime e uma medida de reducao de superficie mais importante que perseguir cada pacote transitivo isoladamente.

### Parecer de AppSec

Nao foi encontrada uma nova causa raiz em uma dependencia restante. A ordem de tratamento deve ser: remover fallbacks de segredo, validar configuracao no startup, reduzir limites de recursos, mapear erros de parser para 4xx/413, atualizar advisories conhecidos, separar dependencias de runtime e somente depois repetir fuzzing direcionado. Esse processo produz evidencia de seguranca mais forte do que classificar cada alerta do audit como vulnerabilidade exploravel.
## Matriz geral de cenarios de risco

O comando `npm run test:dependency-risks` foi executado contra `127.0.0.1:3000`, sem rede externa e sem efeitos persistentes. Os cenarios passaram:

- Helmet entregou CSP e `nosniff`;
- CORS nao refletiu uma origem externa arbitraria;
- JSON acima de 32 KiB foi rejeitado com `413`;
- filtros com metacaracteres SQL retornaram normalmente, sem erro de query;
- OpenAPI publico nao continha `JWT_SECRET` nem `SMTP_PASS`;
- `qs` respeitou o limite de 1.000 parametros, limitou profundidade e nao produziu poluicao de prototipo;
- JWT com `alg:none` foi rejeitado.

Esses testes nao substituem SCA/SAST/DAST completos, mas confirmam os controles basicos dos caminhos de dependencia que estao ativos na Alexandria.

## ValidaÃ§Ã£o adicional de advisories alcanÃ§Ã¡veis

### `body-parser@2.3.0` via `express@5.2.1`

Foi enviado um Ãºnico `POST /api/auth/login` local com JSON gzip vÃ¡lido seguido de bytes extras. A requisiÃ§Ã£o nÃ£o retornou resposta (`fetch failed`) e a checagem imediata de `GET /api/health` nÃ£o conseguiu conectar, indicando encerramento do processo Node. O `nodemon` foi reiniciado manualmente depois do teste e a API voltou a responder.

Esse comportamento Ã© reachability real no caminho HTTP da Alexandria, mas nÃ£o Ã© uma descoberta nova: corresponde ao advisory pÃºblico `GHSA-27r3-jxmh-p828` / `CVE-2026-111181`, que afeta `body-parser >=2.0.0 <2.4.0` e foi corrigido em `2.4.0`. A correÃ§Ã£o deve ser atualizar Express/body-parser ou desabilitar `inflate` se a aplicaÃ§Ã£o nÃ£o precisar aceitar corpos comprimidos. O teste nÃ£o deve ser repetido em carga.

### `bcryptjs@3.0.3`: truncamento de senha

O teste offline confirmou que duas senhas distintas de 89 bytes, com os mesmos primeiros 72 bytes, produzem a mesma decisÃ£o de `compare`. Isso Ã© comportamento compatÃ­vel com bcrypt, nÃ£o uma CVE nova em `bcryptjs`: o prÃ³prio projeto documenta o limite de 72 bytes e expÃµe `bcrypt.truncates(password)` para o consumidor validar o tamanho.

No entanto, a aplicaÃ§Ã£o aceita `password` sem `max()`. Portanto, hÃ¡ um achado de polÃ­tica local: impor um limite de bytes antes do hash (ou rejeitar senhas para as quais `bcrypt.truncates()` seja verdadeiro) evita equivalÃªncia inesperada entre credenciais diferentes. Esse achado pertence Ã  Alexandria, nÃ£o ao mantenedor do bcryptjs.

### Gate de novidade

Depois dos testes offline, HTTP, multipart autenticado, SAST e da reproduÃ§Ã£o acima, os candidatos mais fortes encontrados foram todos classificados:

1. `body-parser`/`qs`, `multer`, `nodemailer`, `zod`, `proxy-addr` e `deepmerge-ts`: advisories pÃºblicos ou riscos de configuraÃ§Ã£o conhecidos;
2. `bcryptjs`: comportamento especificado pelo algoritmo, com consequÃªncia de validaÃ§Ã£o ausente na aplicaÃ§Ã£o;
3. `swagger-ui-express`, `react-router`, `helmet`, `cors`, `jsonwebtoken`, `request-ip` e `ip-range-check`: nenhum comportamento novo alcanÃ§Ã¡vel foi demonstrado nesta revisÃ£o.

ConclusÃ£o: hÃ¡ pelo menos uma vulnerabilidade pÃºblica alcanÃ§Ã¡vel no lockfile (`body-parser`), mas ainda nÃ£o hÃ¡ evidÃªncia honesta para registrar uma nova CVE. Um reporte novo exigiria uma causa raiz independente, fora dos advisories jÃ¡ publicados.

## CorreÃ§Ã£o da polÃ­tica de senha

Foi criado `utils/password-policy.js`, centralizando a validaÃ§Ã£o com `bcrypt.truncates()`. A regra agora Ã© aplicada em cadastro, login, redefiniÃ§Ã£o e alteraÃ§Ã£o de senha. Senhas que excedem 72 bytes sÃ£o rejeitadas antes do acesso ao banco; a verificaÃ§Ã£o considera bytes UTF-8, nÃ£o somente quantidade de caracteres.

O teste `npm run test:password-policy` passou nos trÃªs cenÃ¡rios: ASCII acima do limite, UTF-8 acima do limite com menos caracteres e senha forte dentro do limite. No endpoint HTTP local, ambos os casos acima do limite retornaram `401` sem consultar o banco, e `/api/health` permaneceu em `200`.

## PrÃ³ximo alvo independente: `htmlparser2`

Foi feita uma triagem exploratÃ³ria independente de `htmlparser2@12.0.0` contra `parse5@8.0.1`, incluindo 648 casos de mutaÃ§Ã£o e validaÃ§Ã£o da saÃ­da com `sanitize-html@2.18.0`. Foram observadas divergÃªncias de representaÃ§Ã£o em NUL, namespaces SVG e estruturas HTML, mas nenhum bypass no sanitizador, timeout ou comportamento de execuÃ§Ã£o. O alvo foi classificado como hipÃ³tese nÃ£o confirmada; detalhes em [htmlparser2-research.md](C:/Users/welde/OneDrive/Desktop/alexandria/docs/htmlparser2-research.md).
