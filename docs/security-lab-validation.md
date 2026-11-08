# Registro de validação — Alexandria

**Data:** 2026-10-24
**Escopo:** código local da aplicação Alexandria e laboratório opt-in em `/api/security-lab`.

## Observação arquitetural

O login usa `req.ip` para registrar eventos de acesso. A aplicação também define `app.set('trust proxy', 1)`. Nas rotas atualmente inspecionadas não foi identificado um fluxo que receba uma URL controlada pelo usuário e faça uma conexão HTTP de saída. Portanto, esta validação pode demonstrar normalização e confiança em IP, mas não deve ser descrita como SSRF explorável na Alexandria sem um sink de rede real.

## Evidência da versão vulnerável

No laboratório separado, executando `ip-range-check@0.2.0` e `0.2.1` contra `127.0.0.0/8`:

| Entrada | 0.2.0 | 0.2.1 |
|---|---:|---:|
| `127.1` | `false` | `true` |
| `2130706433` | `true` | `true` |
| `0x7f000001` | `true` | `true` |
| `0177.0.0.1` | `true` | `true` |
| `127.0.0.1` | `true` | `true` |

O caso `127.1` é uma diferença de normalização relevante: a versão vulnerável não reconhece a forma abreviada como pertencente ao loopback, enquanto a corrigida reconhece. O lockfile do laboratório anterior também registra o aviso de depreciação e recomenda `0.2.1+`.

## Limite da conclusão

Essa evidência confirma uma falha de classificação na versão `0.2.0`, alinhada ao advisory de bypass de filtro SSRF citado pelo npm. Ela não confirma que a Alexandria esteja comprometida, porque o aplicativo não conecta esse resultado a um conector HTTP de saída. Para alegar impacto na aplicação seria necessário um fluxo adicional autorizado que use a classificação para permitir/bloquear uma conexão, com um serviço interno sintético ouvindo somente no loopback.

## Execução local na Alexandria

Com a API escutando em `127.0.0.1:3000` e `SECURITY_LAB_ENABLED=true` somente no processo local, foram executados POSTs contra `/api/security-lab/ip-decision`:

| Caso | Resultado HTTP | `blocked` |
|---|---:|---:|
| `127.1` contra `127.0.0.0/8` | `200` | `true` |
| `127.0.0.1` contra `127.0.0.0/8` | `200` | `true` |
| `::ffff:127.0.0.1` contra `127.0.0.0/8` | `200` | `true` |
| `::ffff:192.0.2.10` contra `::ffff:192.0.2.0/120` | `200` | `false` |

Também foi confirmado que `GET /api/health` retorna `200` e que, com o laboratório desativado, `/api/security-lab/ip-decision` retorna `404`.

Os testes automatizados da política passaram: **4 testes, 4 aprovados, 0 falhas**.

## Mitigação aplicada ao laboratório

O projeto declara `ip-range-check@0.2.1`, o endpoint é opt-in e não participa do login. O modo deve permanecer desativado em produção. Depois da instalação local, `npm ls` confirmou `ip-range-check@0.2.1` e `request-ip@3.3.0`.

## Referências

- Advisory e análise pública: https://www.onevilx.tech/posts/ip-range-check-ssrf-bypass/
- Repositório do pacote: https://github.com/danielcompton/ip-range-check
