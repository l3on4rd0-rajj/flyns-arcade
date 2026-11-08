import express from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { z } from 'zod'
import prisma from '../utils/prisma.js'
import { authenticate } from '../middlewares/roles.js'
import { sendSecurityEmail } from '../utils/mailer.js'
import { passwordInput, strongPassword } from '../utils/password-policy.js'
import { jwtSecret as secret } from '../utils/jwt-secret.js'

const router = express.Router()
const securitySecret = process.env.MFA_CHALLENGE_SECRET || `${secret}:security`
const mfaTtlMinutes = Math.max(2, Number(process.env.MFA_CODE_TTL_MINUTES || 10))
const lockDurationMs = 5 * 60 * 1000
const maxAttempts = 3
const mfaEnabled = process.env.MFA_ENABLED !== 'false'
const authAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de autenticacao. Tente novamente mais tarde.' }
})

const hashValue = value =>
  crypto.createHmac('sha256', securitySecret).update(String(value)).digest('hex')
const createMfaCode = () => String(crypto.randomInt(100000, 1000000))
const maskEmail = email => {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`
}
const cpfIsValid = raw => {
  const cpf = String(raw).replace(/\D/g, '')
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digit = size => {
    let sum = 0
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i)
    const value = (sum * 10) % 11
    return value === 10 ? 0 : value
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

const registerSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.email().transform(value => value.toLowerCase()),
  cpf: z.string().transform(value => value.replace(/\D/g, '')).refine(cpfIsValid, 'CPF inválido'),
  password: strongPassword,
  cep: z.string().transform(value => value.replace(/\D/g, '')).pipe(z.string().length(8)),
  street: z.string().trim().min(2),
  number: z.string().trim().min(1),
  complement: z.string().trim().optional(),
  district: z.string().trim().min(2),
  city: z.string().trim().min(2),
  state: z.string().trim().length(2).transform(value => value.toUpperCase())
})
const loginSchema = z.object({ email: z.email(), password: passwordInput })
const publicUser = user => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  status: user.status,
  cep: user.cep,
  street: user.street,
  number: user.number,
  complement: user.complement,
  district: user.district,
  city: user.city,
  state: user.state,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
})
const issueToken = user =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '8h' })

router.post('/register', authAttemptLimit, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Revise os campos do cadastro.', issues: parsed.error.issues })
  }
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.data.email }, { cpf: parsed.data.cpf }] }
  })
  if (exists) return res.status(409).json({ message: 'E-mail ou CPF já cadastrado.' })

  const { password, ...profile } = parsed.data
  const user = await prisma.user.create({
    data: { ...profile, passwordHash: await bcrypt.hash(password, 12) }
  })
  return res.status(201).json({ token: issueToken(user), user: publicUser(user) })
})

router.post('/login', authAttemptLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(401).json({ message: 'E-mail ou senha incorretos.' })

  const email = parsed.data.email.trim().toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.status(401).json({ message: 'E-mail ou senha incorretos.' })
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({
      message: user.status === 'REVOKED' ? 'O acesso desta conta foi revogado.' : 'Esta conta está inativa.'
    })
  }

  const now = new Date()
  if (user.lockedUntil && user.lockedUntil > now) {
    return res.status(423).json({
      message: 'Conta temporariamente bloqueada por tentativas inválidas.',
      locked: true,
      retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000)
    })
  }
  if (user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: null, failedLoginAttempts: 0 }
    })
    user.failedLoginAttempts = 0
  }

  const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1
    if (attempts >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + lockDurationMs)
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil }
      })
      return res.status(423).json({
        message: 'Conta bloqueada por 5 minutos após 3 tentativas inválidas.',
        locked: true,
        retryAfterSeconds: 300
      })
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts }
    })
    return res.status(401).json({
      message: 'E-mail ou senha incorretos.',
      attemptsRemaining: maxAttempts - attempts
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null }
  })
  if (!mfaEnabled) {
    await prisma.accessEvent.create({
      data: { userId: user.id, type: 'LOGIN', ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) }
    })
    return res.json({ token: issueToken(user), user: publicUser(user) })
  }

  const code = createMfaCode()
  const expiresAt = new Date(Date.now() + mfaTtlMinutes * 60 * 1000)
  await prisma.mfaChallenge.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: now }
  })
  const challenge = await prisma.mfaChallenge.create({
    data: { userId: user.id, codeHash: hashValue(code), expiresAt }
  })

  try {
    await sendSecurityEmail({
      to: user.email,
      subject: 'Seu código de acesso — Arcadia Vault',
      text: `Seu código Arcadia é ${code}. Ele expira em ${mfaTtlMinutes} minutos.`,
      html: `<div style="font-family:Arial;background:#0b0d14;color:#fff;padding:32px"><h2>Arcadia Vault</h2><p>Use este código para concluir o login:</p><p style="font-size:32px;letter-spacing:8px;color:#9d86ff"><strong>${code}</strong></p><p>Expira em ${mfaTtlMinutes} minutos. Se não foi você, ignore esta mensagem.</p></div>`
    })
  } catch (error) {
    await prisma.mfaChallenge.delete({ where: { id: challenge.id } })
    console.error('Falha ao enviar MFA:', error.message)
    return res.status(503).json({ message: 'Não foi possível enviar o código MFA. Verifique a configuração SMTP.' })
  }

  return res.json({
    requiresMfa: true,
    challengeId: challenge.id,
    email: maskEmail(user.email),
    expiresInMinutes: mfaTtlMinutes
  })
})

router.post('/login/mfa/verify', authAttemptLimit, async (req, res) => {
  const parsed = z.object({
    challengeId: z.string().min(10),
    code: z.string().regex(/^\d{6}$/)
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Informe o código de 6 dígitos.' })

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { id: parsed.data.challengeId },
    include: { user: true }
  })
  if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
    return res.status(400).json({ message: 'Código expirado. Faça login novamente.' })
  }
  if (challenge.user.status !== 'ACTIVE') {
    return res.status(403).json({ message: 'Esta conta não está ativa.' })
  }
  if (challenge.attempts >= maxAttempts) {
    return res.status(423).json({ message: 'Desafio bloqueado após 3 códigos inválidos. Faça login novamente.' })
  }
  if (hashValue(parsed.data.code) !== challenge.codeHash) {
    const attempts = challenge.attempts + 1
    const updated = await prisma.mfaChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, attempts: challenge.attempts, expiresAt: { gt: new Date() } },
      data: { attempts, usedAt: attempts >= maxAttempts ? new Date() : null }
    })
    if (updated.count !== 1) {
      return res.status(401).json({
        message: 'A verificacao MFA foi atualizada por outra tentativa. Tente novamente.'
      })
    }
    return res.status(attempts >= maxAttempts ? 423 : 401).json({
      message: attempts >= maxAttempts
        ? 'Desafio bloqueado após 3 códigos inválidos. Faça login novamente.'
        : 'Código MFA inválido.',
      attemptsRemaining: Math.max(0, maxAttempts - attempts)
    })
  }

  try {
    await prisma.$transaction(async transaction => {
    const claimed = await transaction.mfaChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: maxAttempts }
      },
      data: { usedAt: new Date() }
    })
    if (claimed.count !== 1) {
      const error = new Error('MFA challenge was already claimed')
      error.code = 'MFA_CHALLENGE_CLAIMED'
      throw error
    }
    await transaction.accessEvent.create({
      data: { userId: challenge.user.id, type: 'LOGIN', ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) }
    })
    })
  } catch (error) {
    if (error.code === 'MFA_CHALLENGE_CLAIMED') {
      return res.status(400).json({ message: 'Codigo MFA expirado ou ja utilizado. Faca login novamente.' })
    }
    throw error
  }
  return res.json({ token: issueToken(challenge.user), user: publicUser(challenge.user) })
})

router.post('/forgot-password', authAttemptLimit, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const genericResponse = {
    message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.'
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return res.json(genericResponse)

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }
  })
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: hashValue(token), expiresAt }
  })
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`
  try {
    await sendSecurityEmail({
      to: user.email,
      subject: 'Redefinição de senha — Arcadia Vault',
      text: `Redefina sua senha em: ${resetUrl}. O link expira em 30 minutos.`,
      html: `<div style="font-family:Arial;background:#0b0d14;color:#fff;padding:32px"><h2>Arcadia Vault</h2><p>Recebemos uma solicitação de redefinição de senha.</p><p><a style="background:#8c73ff;color:#090b12;padding:12px 18px;text-decoration:none" href="${resetUrl}">REDEFINIR SENHA</a></p><p>O link expira em 30 minutos. Se não foi você, ignore esta mensagem.</p></div>`
    })
  } catch (error) {
    console.error('Falha ao enviar redefinição:', error.message)
  }
  return res.json(genericResponse)
})

router.post('/reset-password', authAttemptLimit, async (req, res) => {
  const parsed = z.object({
    token: z.string().min(40),
    password: strongPassword
  }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Token ou nova senha inválidos. Use 8 caracteres, maiúscula, minúscula e número.' })
  }
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashValue(parsed.data.token) }
  })
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
    return res.status(400).json({ message: 'Link inválido ou expirado.' })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  try {
    await prisma.$transaction(async transaction => {
      const claimed = await transaction.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() }
      })
      if (claimed.count !== 1) {
        const error = new Error('Password reset was already claimed')
        error.code = 'PASSWORD_RESET_CLAIMED'
        throw error
      }
      await transaction.user.update({
        where: { id: reset.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null }
      })
      await transaction.mfaChallenge.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() }
      })
    })
  } catch (error) {
    if (error.code === 'PASSWORD_RESET_CLAIMED') {
      return res.status(400).json({ message: 'Link invalido ou ja utilizado.' })
    }
    throw error
  }
  return res.json({ message: 'Senha redefinida com sucesso. Faça login novamente.' })
})

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' })
  return res.json(publicUser(user))
})

export default router
