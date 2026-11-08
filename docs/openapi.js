const json = content => ({ content: { 'application/json': { schema: content } } })
const response = (description, schema) => ({ description, ...(schema ? json(schema) : {}) })
const bearer = [{ bearerAuth: [] }]
const idParameter = {
  name: 'id', in: 'path', required: true, description: 'Identificador do recurso',
  schema: { type: 'string' }
}

const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Arcadia Vault API',
    version: '1.0.0',
    description: 'Documentação da API HTTP do Arcadia Vault.'
  },
  servers: [{ url: '/api', description: 'Servidor atual' }],
  tags: [
    { name: 'Sistema' }, { name: 'Autenticação' }, { name: 'ROMs' },
    { name: 'Perfil' }, { name: 'Usuários' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Error: {
        type: 'object', properties: { message: { type: 'string' } }, required: ['message']
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' }, fullName: { type: 'string' }, email: { type: 'string', format: 'email' },
          cpf: { type: 'string', example: '12345678909' }, role: { type: 'string', enum: ['USER', 'ADMIN'] },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'REVOKED'] }, cep: { type: 'string' },
          street: { type: 'string' }, number: { type: 'string' }, complement: { type: 'string', nullable: true },
          district: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Rom: {
        type: 'object',
        properties: {
          id: { type: 'string' }, title: { type: 'string' }, slug: { type: 'string' },
          platform: { type: 'string', enum: ['GBA', 'SWITCH', 'N3DS'] }, genre: { type: 'string' },
          description: { type: 'string', nullable: true }, coverUrl: { type: 'string', nullable: true },
          fileName: { type: 'string' }, fileSize: { type: 'integer', format: 'int64' },
          releaseYear: { type: 'integer', nullable: true }, featured: { type: 'boolean' },
          available: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ProfileInput: {
        type: 'object', required: ['fullName', 'cep', 'street', 'number', 'district', 'city', 'state'],
        properties: {
          fullName: { type: 'string' }, cep: { type: 'string', minLength: 8, maxLength: 8 },
          street: { type: 'string' }, number: { type: 'string' }, complement: { type: 'string' },
          district: { type: 'string' }, city: { type: 'string' }, state: { type: 'string', minLength: 2, maxLength: 2 }
        }
      },
      RomUpload: {
        type: 'object', required: ['title', 'platform', 'genre'],
        properties: {
          title: { type: 'string' }, platform: { type: 'string', enum: ['GBA', 'SWITCH', 'N3DS'] },
          genre: { type: 'string' }, description: { type: 'string' }, releaseYear: { type: 'integer' },
          file: { type: 'string', format: 'binary' }, cover: { type: 'string', format: 'binary' }
        }
      }
    }
  },
  paths: {}
}

const paths = openapi.paths
paths['/health'] = { get: { tags: ['Sistema'], summary: 'Verifica a saúde da API', responses: { 200: response('API disponível', { type: 'object', properties: { status: { type: 'string', example: 'ok' } } }) } } }
paths['/security-lab/ip-decision'] = {
  post: {
    tags: ['Laboratório de segurança'],
    summary: 'Avalia uma decisão local de bloqueio de IP',
    description: 'Modo opt-in, somente loopback, sem efeito sobre autenticação real. Requer X-Local-Security-Lab: enabled.',
    parameters: [{ in: 'header', name: 'X-Local-Security-Lab', required: true, schema: { type: 'string', enum: ['enabled'] } }],
    requestBody: { required: false, ...json({ type: 'object', properties: { candidateIp: { type: 'string', example: '192.0.2.10' }, blockedRanges: { type: 'array', items: { type: 'string' } } } }) },
    responses: { 200: response('Decisão local'), 400: response('Entrada inválida'), 403: response('Origem não local'), 404: response('Laboratório desativado') }
  }
}
paths['/auth/register'] = { post: { tags: ['Autenticação'], summary: 'Cria uma conta', requestBody: { required: true, ...json({ allOf: [{ $ref: '#/components/schemas/ProfileInput' }], type: 'object', required: ['email', 'cpf', 'password'], properties: { email: { type: 'string', format: 'email' }, cpf: { type: 'string' }, password: { type: 'string', format: 'password' } } }) }, responses: { 201: response('Conta criada'), 400: response('Dados inválidos'), 409: response('E-mail ou CPF já cadastrado') } } }
paths['/auth/login'] = { post: { tags: ['Autenticação'], summary: 'Inicia uma sessão', requestBody: { required: true, ...json({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } }) }, responses: { 200: response('Token emitido ou desafio MFA criado'), 401: response('Credenciais inválidas'), 423: response('Conta bloqueada') } } }
paths['/auth/login/mfa/verify'] = { post: { tags: ['Autenticação'], summary: 'Valida o código MFA', requestBody: { required: true, ...json({ type: 'object', required: ['challengeId', 'code'], properties: { challengeId: { type: 'string' }, code: { type: 'string', pattern: '^\\d{6}$' } } }) }, responses: { 200: response('Token emitido'), 400: response('Código inválido ou expirado'), 423: response('Desafio bloqueado') } } }
paths['/auth/forgot-password'] = { post: { tags: ['Autenticação'], summary: 'Solicita redefinição de senha', requestBody: { required: true, ...json({ type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }) }, responses: { 200: response('Solicitação processada') } } }
paths['/auth/reset-password'] = { post: { tags: ['Autenticação'], summary: 'Redefine a senha', requestBody: { required: true, ...json({ type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string', format: 'password' } } }) }, responses: { 200: response('Senha redefinida'), 400: response('Token ou senha inválidos') } } }
paths['/auth/me'] = { get: { tags: ['Autenticação'], summary: 'Retorna o usuário autenticado', security: bearer, responses: { 200: response('Usuário', { $ref: '#/components/schemas/User' }), 401: response('Não autenticado') } } }
paths['/roms'] = {
  get: { tags: ['ROMs'], summary: 'Lista ROMs', parameters: ['platform', 'q', 'genre'].map(name => ({ name, in: 'query', schema: { type: 'string' } })), responses: { 200: response('ROMs', { type: 'array', items: { $ref: '#/components/schemas/Rom' } }) } },
  post: { tags: ['ROMs'], summary: 'Cadastra uma ROM (admin)', security: bearer, requestBody: { required: true, content: { 'multipart/form-data': { schema: { ...openapi.components.schemas.RomUpload, required: ['title', 'platform', 'genre', 'file', 'cover'] } } } }, responses: { 201: response('ROM criada'), 400: response('Dados inválidos'), 401: response('Não autenticado'), 403: response('Acesso negado') } }
}
paths['/roms/genres'] = { get: { tags: ['ROMs'], summary: 'Lista gêneros', responses: { 200: response('Gêneros', { type: 'array', items: { type: 'string' } }) } } }
paths['/roms/{id}'] = {
  get: { tags: ['ROMs'], summary: 'Consulta uma ROM (admin)', security: bearer, parameters: [idParameter], responses: { 200: response('ROM', { $ref: '#/components/schemas/Rom' }), 404: response('Não encontrada') } },
  patch: { tags: ['ROMs'], summary: 'Atualiza uma ROM (admin)', security: bearer, parameters: [idParameter], requestBody: { required: true, content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/RomUpload' } } } }, responses: { 200: response('ROM atualizada'), 400: response('Dados inválidos'), 404: response('Não encontrada') } },
  delete: { tags: ['ROMs'], summary: 'Exclui uma ROM (admin)', security: bearer, parameters: [idParameter], responses: { 204: { description: 'ROM excluída' }, 404: response('Não encontrada') } }
}
paths['/roms/{id}/download'] = { get: { tags: ['ROMs'], summary: 'Baixa uma ROM', security: bearer, parameters: [idParameter], responses: { 200: { description: 'Arquivo da ROM', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 404: response('Arquivo indisponível') } } }
paths['/profile'] = {
  get: { tags: ['Perfil'], summary: 'Consulta o próprio perfil', security: bearer, responses: { 200: response('Perfil', { $ref: '#/components/schemas/User' }) } },
  patch: { tags: ['Perfil'], summary: 'Atualiza o próprio perfil', security: bearer, requestBody: { required: true, ...json({ $ref: '#/components/schemas/ProfileInput' }) }, responses: { 200: response('Perfil atualizado'), 400: response('Dados inválidos') } }
}
paths['/profile/password'] = { patch: { tags: ['Perfil'], summary: 'Altera a própria senha', security: bearer, requestBody: { required: true, ...json({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string', format: 'password' }, newPassword: { type: 'string', format: 'password' } } }) }, responses: { 200: response('Senha atualizada'), 400: response('Senha fora do padrão'), 401: response('Senha atual incorreta') } } }
paths['/profile/downloads'] = { get: { tags: ['Perfil'], summary: 'Lista os próprios downloads', security: bearer, responses: { 200: response('Downloads', { type: 'array', items: { type: 'object' } }) } } }
paths['/usuarios/metrics'] = { get: { tags: ['Usuários'], summary: 'Exibe métricas administrativas', security: bearer, responses: { 200: response('Métricas') } } }
paths['/usuarios'] = { get: { tags: ['Usuários'], summary: 'Lista usuários (admin)', security: bearer, responses: { 200: response('Usuários', { type: 'array', items: { $ref: '#/components/schemas/User' } }) } } }
paths['/usuarios/{id}'] = {
  get: { tags: ['Usuários'], summary: 'Consulta um usuário (admin)', security: bearer, parameters: [idParameter], responses: { 200: response('Usuário'), 404: response('Não encontrado') } },
  delete: { tags: ['Usuários'], summary: 'Exclui um usuário (admin)', security: bearer, parameters: [idParameter], responses: { 204: { description: 'Usuário excluído' }, 400: response('Operação inválida'), 404: response('Não encontrado') } }
}
paths['/usuarios/{id}/role'] = { patch: { tags: ['Usuários'], summary: 'Altera o perfil de acesso (admin)', security: bearer, parameters: [idParameter], requestBody: { required: true, ...json({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['USER', 'ADMIN'] } } }) }, responses: { 200: response('Usuário atualizado'), 400: response('Operação inválida') } } }
paths['/usuarios/{id}/status'] = { patch: { tags: ['Usuários'], summary: 'Altera o status (admin)', security: bearer, parameters: [idParameter], requestBody: { required: true, ...json({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'REVOKED'] } } }) }, responses: { 200: response('Usuário atualizado'), 400: response('Operação inválida') } } }

export default openapi
