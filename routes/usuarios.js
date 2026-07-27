import express from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma.js'
import { authenticate, adminOnly } from '../middlewares/roles.js'

const router = express.Router()

router.use(authenticate, adminOnly)

const serializeUser = ({ passwordHash, ...user }) => user

// GET /api/usuarios
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  })

  res.json(users.map(serializeUser))
})

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id }
  })

  if (!user) {
    return res.status(404).json({ message: 'Usuário não encontrado.' })
  }

  return res.json(serializeUser(user))
})

// PATCH /api/usuarios/:id/role
router.patch('/:id/role', async (req, res) => {
  const parsed = z.object({
    role: z.enum(['USER', 'ADMIN'])
  }).safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'O perfil deve ser USER ou ADMIN.' })
  }

  if (req.user.id === req.params.id && parsed.data.role !== 'ADMIN') {
    return res.status(400).json({
      message: 'Você não pode remover sua própria permissão administrativa.'
    })
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role }
    })

    return res.json(serializeUser(user))
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Usuário não encontrado.' })
    }
    throw error
  }
})

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({
      message: 'Você não pode excluir seu próprio usuário.'
    })
  }

  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    return res.status(204).end()
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Usuário não encontrado.' })
    }
    throw error
  }
})

export default router
