import express from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../utils/prisma.js'
import { authenticate } from '../middlewares/roles.js'
import { passwordInput, strongPassword } from '../utils/password-policy.js'

const router = express.Router()
router.use(authenticate)

const profileSelect = {
  id: true, fullName: true, email: true, cpf: true, role: true, status: true,
  cep: true, street: true, number: true, complement: true, district: true,
  city: true, state: true, createdAt: true, updatedAt: true
}

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: profileSelect })
  res.json(user)
})

router.patch('/', async (req, res) => {
  const parsed = z.object({
    fullName: z.string().trim().min(3).max(120),
    cep: z.string().transform(value => value.replace(/\D/g, '')).pipe(z.string().length(8)),
    street: z.string().trim().min(2).max(160),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(100).optional().default(''),
    district: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().length(2).transform(value => value.toUpperCase())
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Revise os dados do perfil.', issues: parsed.error.issues })

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: parsed.data, select: profileSelect }),
    prisma.accessEvent.create({
      data: { userId: req.user.id, type: 'PROFILE_UPDATE', ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) }
    })
  ])
  res.json(user)
})

router.patch('/password', async (req, res) => {
  const parsed = z.object({
    currentPassword: passwordInput,
    newPassword: strongPassword
  }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'A nova senha deve ter 8 caracteres, maiúscula, minúscula e número.' })
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user || !await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)) {
    return res.status(401).json({ message: 'A senha atual está incorreta.' })
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), failedLoginAttempts: 0, lockedUntil: null }
    }),
    prisma.mfaChallenge.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.accessEvent.create({
      data: { userId: user.id, type: 'PASSWORD_CHANGE', ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) }
    })
  ])
  res.json({ message: 'Senha atualizada com sucesso.' })
})

router.get('/downloads', async (req, res) => {
  const downloads = await prisma.download.findMany({
    where: { userId: req.user.id },
    include: { rom: { select: { id: true, title: true, platform: true, coverUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  res.json(downloads)
})

export default router
