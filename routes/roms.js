import express from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { z } from 'zod'
import prisma from '../utils/prisma.js'
import { authenticate, adminOnly } from '../middlewares/roles.js'
import { toPublicRom } from '../utils/rom-public.js'

const router = express.Router()
const roomsRoot = path.resolve('rooms')
const platformFolders = { GBA: 'gba', SWITCH: 'switch', N3DS: '3ds' }
const coverDir = path.join(roomsRoot, 'covers')

for (const folder of [...Object.values(platformFolders), 'covers']) {
  fs.mkdirSync(path.join(roomsRoot, folder), { recursive: true })
}

const safeBaseName = (value) =>
  path.basename(value, path.extname(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'arquivo'

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'cover') return cb(null, coverDir)
    const folder = platformFolders[String(req.body.platform || '').toUpperCase()]
    if (!folder) return cb(new Error('Selecione um emulador válido antes do arquivo.'))
    return cb(null, path.join(roomsRoot, folder))
  },
  filename(_req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase()
    cb(null, `${safeBaseName(file.originalname)}-${crypto.randomUUID()}${extension}`)
  }
})

const romExtensions = /\.(zip|7z|gba|xci|nsp|3ds|cia)$/i
const coverExtensions = /\.(jpe?g|png|webp)$/i
const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024 * 1024,
    files: 2,
    // Keep multipart metadata bounded; fileSize/files alone do not cap fields.
    fields: 64,
    parts: 66,
    fieldNameSize: 128,
    fieldSize: 8 * 1024,
    headerPairs: 200
  },
  fileFilter: (_req, file, cb) => {
    const allowed = file.fieldname === 'cover'
      ? coverExtensions.test(file.originalname) && /^image\/(jpeg|png|webp)$/.test(file.mimetype)
      : file.fieldname === 'file' && romExtensions.test(file.originalname)
    cb(allowed ? null : new Error(`Arquivo inválido no campo ${file.fieldname}.`), allowed)
  }
})

const metadataSchema = z.object({
  title: z.string().trim().min(2).max(120),
  platform: z.enum(['GBA', 'SWITCH', 'N3DS']),
  genre: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).optional(),
  releaseYear: z.coerce.number().int().min(1989).max(2100).optional()
})

const removeUploadedFiles = (files = {}) => {
  for (const file of Object.values(files).flat()) {
    if (file?.path) fs.unlink(file.path, () => {})
  }
}

router.get('/', async (req, res) => {
  const platform = req.query.platform
  const query = String(req.query.q || '').trim()
  const genre = String(req.query.genre || '').trim()
  const where = {
    ...(platform && ['GBA', 'SWITCH', 'N3DS'].includes(platform) ? { platform } : {}),
    ...(query ? { title: { contains: query } } : {}),
    ...(genre ? { genre: { contains: genre } } : {})
  }
  const items = await prisma.rom.findMany({
    where,
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }]
  })
  res.json(items.map(item => toPublicRom(item)))
})

router.get('/genres', async (_req, res) => {
  const genres = await prisma.rom.findMany({ distinct: ['genre'], select: { genre: true }, orderBy: { genre: 'asc' } })
  res.json(genres.map(item => item.genre).filter(Boolean))
})

router.get('/:id', authenticate, adminOnly, async (req, res) => {
  const rom = await prisma.rom.findUnique({ where: { id: req.params.id } })
  if (!rom) return res.status(404).json({ message: 'ROM não encontrada.' })
  res.json({ ...rom, fileSize: Number(rom.fileSize) })
})

router.post(
  '/',
  authenticate,
  adminOnly,
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
    const romFile = req.files?.file?.[0]
    const coverFile = req.files?.cover?.[0]
    if (!romFile || !coverFile) {
      removeUploadedFiles(req.files)
      return res.status(400).json({ message: 'Selecione a ROM e a imagem de capa.' })
    }

    const parsed = metadataSchema.safeParse(req.body)
    if (!parsed.success) {
      removeUploadedFiles(req.files)
      return res.status(400).json({
        message: 'Revise os dados da ROM.',
        issues: parsed.error.issues
      })
    }

    const slugBase = safeBaseName(parsed.data.title).toLowerCase()
    try {
      const rom = await prisma.rom.create({
        data: {
          ...parsed.data,
          slug: `${slugBase}-${Date.now()}`,
          coverUrl: `/rooms/covers/${coverFile.filename}`,
          fileName: romFile.originalname,
          filePath: romFile.path,
          fileSize: romFile.size
        }
      })
      return res.status(201).json({ ...rom, fileSize: Number(rom.fileSize) })
    } catch (error) {
      removeUploadedFiles(req.files)
      throw error
    }
  }
)

router.patch(
  '/:id',
  authenticate,
  adminOnly,
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
    const current = await prisma.rom.findUnique({ where: { id: req.params.id } })
    if (!current) {
      removeUploadedFiles(req.files)
      return res.status(404).json({ message: 'ROM não encontrada.' })
    }

    const parsed = metadataSchema.safeParse(req.body)
    if (!parsed.success) {
      removeUploadedFiles(req.files)
      return res.status(400).json({ message: 'Revise os dados da ROM.', issues: parsed.error.issues })
    }

    const romFile = req.files?.file?.[0]
    const coverFile = req.files?.cover?.[0]
    try {
      const rom = await prisma.rom.update({
        where: { id: current.id },
        data: {
          ...parsed.data,
          ...(romFile ? {
            fileName: romFile.originalname,
            filePath: romFile.path,
            fileSize: romFile.size
          } : {}),
          ...(coverFile ? { coverUrl: `/rooms/covers/${coverFile.filename}` } : {})
        }
      })

      if (romFile && current.filePath !== romFile.path) fs.unlink(current.filePath, () => {})
      if (coverFile && current.coverUrl?.startsWith('/rooms/covers/')) {
        fs.unlink(path.join(coverDir, path.basename(current.coverUrl)), () => {})
      }
      return res.json({ ...rom, fileSize: Number(rom.fileSize) })
    } catch (error) {
      removeUploadedFiles(req.files)
      throw error
    }
  }
)

router.get('/:id/download', authenticate, async (req, res) => {
  const rom = await prisma.rom.findUnique({ where: { id: req.params.id } })
  if (!rom || !fs.existsSync(rom.filePath)) {
    return res.status(404).json({ message: 'Arquivo não disponível.' })
  }
  await prisma.download.create({ data: { romId: rom.id, userId: req.user.id } })
  res.download(path.resolve(rom.filePath), rom.fileName)
})

router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  const rom = await prisma.rom.findUnique({ where: { id: req.params.id } })
  if (!rom) return res.status(404).json({ message: 'ROM não encontrada.' })

  await prisma.rom.delete({ where: { id: rom.id } })
  fs.unlink(rom.filePath, () => {})
  if (rom.coverUrl?.startsWith('/rooms/covers/')) {
    fs.unlink(path.join(coverDir, path.basename(rom.coverUrl)), () => {})
  }
  res.status(204).end()
})

export default router
