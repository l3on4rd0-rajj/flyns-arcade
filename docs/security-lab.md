# Laboratório local de decisão por IP

Este laboratório existe para testar, em ambiente autorizado, se uma representação alternativa de IP altera uma decisão de bloqueio baseada em `ip-range-check`.

## Garantias de segurança

- Desativado por padrão (`SECURITY_LAB_ENABLED` não é `true`).
- Não participa de login, MFA, JWT, autorização ou rate limiting.
- Aceita somente conexões cujo peer seja loopback.
- Exige o cabeçalho explícito `X-Local-Security-Lab: enabled`.
- Não realiza DNS, conexão de saída ou requisição a outro serviço.
- Use somente endereços de documentação, como `192.0.2.10`.

## Execução local

1. Instale as dependências normalmente com `npm install`.
2. Defina temporariamente `SECURITY_LAB_ENABLED=true` no processo local.
3. Inicie a API.
4. No Swagger, execute `POST /api/security-lab/ip-decision` com o cabeçalho `X-Local-Security-Lab: enabled`.

Exemplo de corpo:

```json
{
  "candidateIp": "127.1",
  "blockedRanges": ["127.0.0.0/8"]
}
```

Na versão vulnerável `0.2.0`, o mesmo caso retornou `blocked: false`; na versão corrigida `0.2.1`, retorna `blocked: true`. Isso demonstra a correção da normalização da entrada, mas não prova impacto na Alexandria: seria necessário um fluxo real que conectasse essa decisão a uma requisição de rede ou autorização. O endpoint de laboratório deliberadamente não faz essa ligação.

## Limpeza

Após a coleta, remova `SECURITY_LAB_ENABLED` do ambiente e reinicie o processo. Não habilite este modo em produção.
