import bcrypt from 'bcryptjs'
import { z } from 'zod'

const truncationMessage = 'A senha deve ter no maximo 72 bytes.'

const bcryptSafePassword = z.string().refine(value => !bcrypt.truncates(value), {
  message: truncationMessage
})

export const passwordInput = bcryptSafePassword.min(1)

export const strongPassword = bcryptSafePassword
  .min(8)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/\d/)
