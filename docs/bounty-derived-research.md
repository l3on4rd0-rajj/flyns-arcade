# Pesquisa derivada de relatorios publicos

## Escopo

Esta rodada converteu tecnicas publicadas em relatorios de bug bounty e advisories em propriedades testaveis contra copias locais das dependencias e contra a configuracao do Alexandria. Nenhum alvo externo foi acessado.

Padroes avaliados:

- ReDoS e custo de parsing que cresce de forma desproporcional;
- parser differential e normalizacao inconsistente;
- amplificacao de recursos em entradas multipart;
- limites aplicados depois do parsing ou ausentes.

## Baseline local

Os testes offline nao encontraram comportamento ReDoS claro em `request-ip`, `append-field`, `qs`, `nodemailer`, `zod`, `path-to-regexp`, `minimatch`, `brace-expansion`, `content-disposition` ou `semver` nas matrizes limitadas usadas.

As requisicoes publicas para `/api/roms` retornaram HTTP 500 em aproximadamente 2 segundos, independentemente do tamanho da entrada. O tempo foi associado a falha/timeout do Prisma local, e nao a crescimento do parser; a aplicacao continuou respondendo em `/api/health`.

## Achado de configuracao multipart

A configuracao original do `multer` limitava `fileSize` e `files`, mas nao limitava `fields`, `parts`, `fieldNameSize`, `fieldSize` ou `headerPairs`. No harness local, a configuracao equivalente aceitou 5.000 campos aninhados; a variante com os limites do Alexandria rejeitou 100, 1.000 e 5.000 campos com `LIMIT_FIELD_COUNT`.

Isso caracteriza hardening da aplicacao, nao uma vulnerabilidade demonstrada no `multer`: a biblioteca oferece esses limites e o consumidor precisava configura-los. A rota tambem exige autenticacao e perfil administrativo antes do upload, reduzindo a exposicao.

## Correcao aplicada

`routes/roms.js` agora define limites para metadados multipart:

- `fields: 64`;
- `parts: 66` (campos mais dois arquivos);
- `fieldNameSize: 128`;
- `fieldSize: 8 KiB`;
- `headerPairs: 200`.

O limite de arquivo e de quantidade de arquivos existente foi preservado para nao alterar o contrato funcional sem uma decisao de produto.

O teste de fronteira de proxy tambem demonstrou que `trust proxy = 1` aceitava um `X-Forwarded-For` enviado diretamente pelo cliente. `server.js` agora usa `TRUST_PROXY=false` por padrao; ambientes atras de um proxy devem declarar explicitamente a topologia confiavel, por exemplo `TRUST_PROXY=1` quando houver exatamente um proxy controlado. Com o padrao seguro, `req.ip` permanece `127.0.0.1`, enquanto `request-ip` continua lendo o header encaminhado por seu contrato; por isso ele nao deve ser usado sozinho para decisao de confianca quando o cliente pode alcancar a aplicacao diretamente.

## Reproducao

```text
node research/bounty-derived-lab/multipart-limits.mjs
npm run build
```

Resultado observado: a configuracao sem limites de partes aceitou 5.000 campos em aproximadamente 142 ms no ambiente local; a configuracao limitada rejeitou os casos acima do limite, sem timeout.

## Classificacao

Nao ha base para uma nova CVE do `multer`. O resultado e uma melhoria de configuracao do Alexandria e uma metodologia reutilizavel para investigar futuras dependencias: extrair tecnica publica, construir um oracle/harness local, medir escalabilidade, comparar versao corrigida e somente entao avaliar reporte ao mantenedor.

## Achado adicional de autenticacao

O caminho de autenticacao principal tinha fallback para `arcadia-dev-secret` mesmo em producao quando `JWT_SECRET` nao estava definido. Isso e um risco de configuracao da aplicacao, nao uma falha do `jsonwebtoken`. A correcao centraliza o segredo em `utils/jwt-secret.js` e faz o processo falhar no startup de producao sem `JWT_SECRET`; o fallback permanece somente para desenvolvimento local.

O endpoint publico `GET /api/roms` tambem devolvia `filePath`, embora o OpenAPI nao o documentasse. A resposta agora usa uma projecao que remove o caminho absoluto do servidor e preserva apenas os campos necessarios ao cliente. O teste esta em `test/public-rom-projection.test.mjs`.

O `jsonwebtoken` ja rejeitava `alg:none` nos testes locais, mas os dois verificadores agora declaram explicitamente `HS256`. Continua pendente a revogacao imediata de JWTs emitidos antes de uma troca de senha; isso requer um `sessionVersion` ou `passwordChangedAt` persistido no usuario e uma migracao Prisma.

A revisao de concorrencia encontrou janelas TOCTOU em MFA e reset de senha: o codigo consultava `usedAt` e depois atualizava por ID sem uma condicao atomica. Os fluxos agora reivindicam o desafio/token com `updateMany` condicional dentro de transacao. Com MariaDB local ativo, 8 verificacoes MFA corretas concorrentes produziram 1 sucesso e 7 recusas; 8 resets concorrentes produziram 1 sucesso e 7 recusas. O mesmo desafio MFA atingiu `attempts=3`, marcou `usedAt` e retornou `401, 423` nas duas tentativas sequenciais finais.

Foi adicionado um limite especifico de 30 tentativas por 15 minutos para cadastro, login, MFA, recuperacao e redefinicao de senha. O teste isolado envia 35 corpos invalidos para `127.0.0.1:3003`, sem banco ou email, e confirma HTTP 429 a partir da 31a requisicao.

## Triagem SAST adicional

- Os alertas de `missing-rate-limiting` apontam para `routes/private.js`, que nao e montado por `server.js` nesta versao. O rate limit global continua aplicado aos endpoints ativos.
- O alerta de `http-to-file-access` em `utils/logger.js` e falso positivo para path traversal: o tipo do log e controlado pelo codigo e `getLogFileName()` monta o caminho dentro de `logs/`. Dados HTTP entram no conteudo da linha, nao no caminho do arquivo.
- O `Dockerfile` ainda copia `node_modules` completo para runtime. Isso amplia a superficie da imagem com dependencias de desenvolvimento; a correcao recomendada e separar a instalacao de producao da etapa que executa o build, mas isso deve ser feito junto com a estrategia de migracao Prisma.
