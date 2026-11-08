import jwt from 'jsonwebtoken'
import prisma from '../utils/prisma.js'
import { jwtSecret as secret } from '../utils/jwt-secret.js'

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Faça login para continuar.' })
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, status: true }
    })
    if (!user) return res.status(401).json({ message: 'Usuário não encontrado.' })
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        message: user.status === 'REVOKED'
          ? 'O acesso desta conta foi revogado.'
          : 'Esta conta está inativa. Procure um administrador.'
      })
    }
    req.user = user
    next()
  } catch {
    res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso restrito a administradores.' })
  next()
}
