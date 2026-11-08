import express from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma.js'
import { authenticate, adminOnly } from '../middlewares/roles.js'

const router = express.Router()
router.use(authenticate, adminOnly)

const safeUser = ({ passwordHash, ...user }) => user

router.get('/metrics', async (_req, res) => {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - 6)
  const [totalUsers, activeUsers, inactiveUsers, revokedUsers, totalDownloads, totalAccesses, downloads, accesses] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'INACTIVE' } }),
      prisma.user.count({ where: { status: 'REVOKED' } }),
      prisma.download.count(),
      prisma.accessEvent.count({ where: { type: 'LOGIN' } }),
      prisma.download.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.accessEvent.findMany({ where: { type: 'LOGIN', createdAt: { gte: since } }, select: { createdAt: true } })
    ])

  const timeline = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(since)
    date.setDate(date.getDate() + offset)
    const key = date.toISOString().slice(0, 10)
    return {
      date: key,
      downloads: downloads.filter(item => item.createdAt.toISOString().slice(0, 10) === key).length,
      accesses: accesses.filter(item => item.createdAt.toISOString().slice(0, 10) === key).length
    }
  })
  res.json({ totalUsers, activeUsers, inactiveUsers, revokedUsers, totalDownloads, totalAccesses, timeline })
})

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { _count: { select: { downloads: true, accessEvents: true } } },
    orderBy: { createdAt: 'desc' }
  })
  res.json(users.map(safeUser))
})

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { downloads: true, accessEvents: true } },
      downloads: { include: { rom: { select: { title: true, platform: true } } }, orderBy: { createdAt: 'desc' }, take: 20 },
      accessEvents: { orderBy: { createdAt: 'desc' }, take: 20 }
    }
  })
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' })
  res.json(safeUser(user))
})

router.patch('/:id/role', async (req, res) => {
  const parsed = z.object({ role: z.enum(['USER', 'ADMIN']) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'O perfil deve ser USER ou ADMIN.' })
  if (req.user.id === req.params.id && parsed.data.role !== 'ADMIN') {
    return res.status(400).json({ message: 'Você não pode remover sua própria permissão administrativa.' })
  }
  try {
    const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data })
    res.json(safeUser(user))
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Usuário não encontrado.' })
    throw error
  }
})

router.patch('/:id/status', async (req, res) => {
  const parsed = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'REVOKED']) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Status inválido.' })
  if (req.user.id === req.params.id && parsed.data.status !== 'ACTIVE') {
    return res.status(400).json({ message: 'Você não pode bloquear sua própria conta.' })
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        failedLoginAttempts: 0,
        lockedUntil: parsed.data.status === 'ACTIVE' ? null : new Date()
      }
    })
    res.json(safeUser(user))
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Usuário não encontrado.' })
    throw error
  }
})

router.delete('/:id', async (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ message: 'Você não pode excluir seu próprio usuário.' })
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Usuário não encontrado.' })
    throw error
  }
})

export default router
