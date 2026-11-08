import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient, Platform, Role } from '@prisma/client'

const prisma = new PrismaClient()
const adminEmail = process.env.ADMIN_EMAIL
const adminPassword = process.env.ADMIN_PASSWORD

if (!adminEmail || !adminPassword) {
  throw new Error('ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios para executar o seed.')
}

const games = [
  ['Pokémon Emerald', 'pokemon-emerald', Platform.GBA, 2004, '/previews/pokemon/gba/emerald-gba.jpg', 'RPG'],
  ['Pokémon FireRed', 'pokemon-firered', Platform.GBA, 2004, '/previews/pokemon/gba/firered-gba.jpg', 'RPG'],
  ['Metroid Fusion', 'metroid-fusion', Platform.GBA, 2002, '/previews/metroid/metroid-gba.jpg', 'Ação'],
  ['Zelda: Breath of the Wild', 'zelda-botw', Platform.SWITCH, 2017, null, 'Aventura'],
  ['Mario Kart 8 Deluxe', 'mario-kart-8', Platform.SWITCH, 2017, '/previews/mario/deluxe8-switch.jpg', 'Corrida'],
  ['Hollow Knight', 'hollow-knight', Platform.SWITCH, 2018, null, 'Ação'],
  ['Pokémon Platinum', 'pokemon-platinum', Platform.N3DS, 2008, '/previews/pokemon/platinum/platinum-3ds.jpg', 'RPG'],
  ['Pokémon SoulSilver', 'pokemon-soulsilver', Platform.N3DS, 2009, '/previews/pokemon/platinum/soulsilver-3ds.jpg', 'RPG'],
  ['Pokémon White', 'pokemon-white', Platform.N3DS, 2010, '/previews/pokemon/platinum/white-3ds.jpg', 'RPG']
]

await prisma.user.upsert({
  where: { email: adminEmail },
  update: { role: Role.ADMIN },
  create: {
    fullName: 'Administrador Arcadia',
    email: adminEmail,
    cpf: '52998224725',
    passwordHash: await bcrypt.hash(adminPassword, 12),
    role: Role.ADMIN,
    cep: '01001000',
    street: 'Praça da Sé',
    number: '1',
    district: 'Sé',
    city: 'São Paulo',
    state: 'SP'
  }
})

for (const [title, slug, platform, releaseYear, coverUrl, genre] of games) {
  await prisma.rom.upsert({
    where: { slug },
    update: { coverUrl, genre },
    create: {
      title, slug, platform, releaseYear, coverUrl, genre,
      description: 'Item demonstrativo do catálogo beta.',
      fileName: `${slug}.zip`,
      filePath: `uploads/roms/${slug}.zip`,
      fileSize: 0
    }
  })
}

await prisma.$disconnect()
