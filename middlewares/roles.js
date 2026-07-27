import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET || 'arcadia-dev-secret'

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Faça login para continuar.' })
  try {
    req.user = jwt.verify(token, secret)
    next()
  } catch {
    res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Acesso restrito a administradores.' })
  next()
}
