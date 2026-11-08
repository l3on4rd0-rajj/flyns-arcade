import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { passwordInput, strongPassword } from '../utils/password-policy.js'

test('rejects passwords that bcrypt would truncate', () => {
  const password = `Aa1${'x'.repeat(70)}`
  assert.equal(Buffer.byteLength(password, 'utf8') > 72, true)
  assert.equal(bcrypt.truncates(password), true)
  assert.equal(strongPassword.safeParse(password).success, false)
  assert.equal(passwordInput.safeParse(password).success, false)
})

test('rejects UTF-8 passwords over 72 bytes even when character count is lower', () => {
  const password = `Aa1${'á'.repeat(35)}`
  assert.equal(password.length < 72, true)
  assert.equal(Buffer.byteLength(password, 'utf8') > 72, true)
  assert.equal(strongPassword.safeParse(password).success, false)
})

test('accepts a strong password within the bcrypt byte limit', () => {
  const password = `Aa1${'x'.repeat(60)}`
  assert.equal(Buffer.byteLength(password, 'utf8') <= 72, true)
  assert.equal(strongPassword.safeParse(password).success, true)
})
