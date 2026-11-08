# Arcadia Vault

MVP de catálogo privado para organizar backups legais de jogos de Game Boy Advance,
Nintendo Switch e Nintendo 3DS. O front usa React + Three.js; a API usa Express,
JWT, Prisma e MySQL/MariaDB.

## Configuração

### Deploy completo com Docker

Copie `.env.example` para `.env`, troque todas as senhas e execute:

```bash
docker compose up -d --build
```

A aplicação (front-end e API) ficará disponível em `http://localhost:3000`.
O schema Prisma é sincronizado automaticamente na inicialização. Os dados do
MariaDB e os arquivos enviados ficam nos volumes `arcadia_mariadb_data` e
`arcadia_rooms_data`, respectivamente.

Para acompanhar a inicialização ou atualizar uma instalação:

```bash
docker compose logs -f app
docker compose up -d --build
```

### Banco local com Docker

O ambiente local inclui um MariaDB com volume persistente:

```bash
docker compose up -d mariadb
npx prisma db push
npm run prisma:seed
npm run dev
```

O volume `arcadia_mariadb_data` mantém usuários, ROMs e históricos mesmo após
`docker compose down` ou reinicialização do computador.

Para parar e iniciar novamente:

```bash
docker compose stop mariadb
docker compose start mariadb
```

`docker compose down` remove o container e a rede, mas preserva o volume. Não use
`docker compose down -v` se quiser manter os dados.

### Banco externo

1. Copie `.env.example` para `.env` e ajuste a conexão MariaDB/MySQL.
2. Crie o banco `arcadia_vault`.
3. Execute:

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Front-end: `http://localhost:5173`  
API: `http://localhost:3000`

O seed cria o administrador definido em `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Troque a
senha padrão antes de compartilhar o ambiente.

## Controle de acesso

- Qualquer visitante pode consultar o catálogo.
- Cadastro/login é obrigatório para downloads.
- Somente JWTs com `role: ADMIN` acessam upload e remoção na API.
- A rota `/admin` também é protegida no front, mas a API é a barreira de segurança
  efetiva.
- O formulário dedicado de upload fica em `http://localhost:5173/admin/upload`.

## Armazenamento das ROMs

O upload administrativo exige dois arquivos: a ROM e sua imagem de capa. Os
arquivos são separados automaticamente por plataforma:

```text
rooms/
├── gba/
├── switch/
├── 3ds/
└── covers/
```

Formatos de ROM aceitos: GBA, XCI, NSP, 3DS, CIA, ZIP e 7Z. As capas aceitam JPG,
PNG e WEBP.

## CEP

No cadastro, digite os oito números do CEP e pressione Enter. O endereço é
preenchido pela ViaCEP, fonte baseada nos dados postais brasileiros. Número e
complemento continuam sob responsabilidade do usuário.

## Uso responsável

O sistema deve armazenar apenas arquivos que o operador e seus usuários tenham
direito legal de manter e distribuir. Nenhuma ROM comercial é incluída no projeto;
os itens iniciais são somente metadados demonstrativos.
