import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import prisma from '../utils/prisma.js'

const apiPort = 3_004
const smtpPort = 2_526
const apiBase = `http://127.0.0.1:${apiPort}`
const testEmail = `race-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`
const testPassword = 'LocalPass1'
const nextPassword = 'AnotherPass2'
const capturedMessages = []
let smtpServer
let child
let childOutput = ''

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function makeCpf() {
  const base = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')
  const digit = length => {
    let sum = 0
    for (let index = 0; index < length; index += 1) sum += Number(base[index]) * (length + 1 - index)
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  }
  return `${base}${digit(9)}${(() => {
    const value = `${base}${digit(9)}`
    let sum = 0
    for (let index = 0; index < 10; index += 1) sum += Number(value[index]) * (11 - index)
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  })()}`
}

function startSmtpSink() {
  const server = net.createServer(socket => {
    let buffer = ''
    let dataMode = false
    let message = ''
    const send = value => socket.write(`${value}\r\n`)
    const finishData = () => {
      const marker = '\r\n.\r\n'
      const index = message.indexOf(marker)
      if (index < 0) return false
      capturedMessages.push(message.slice(0, index))
      message = message.slice(index + marker.length)
      dataMode = false
      send('250 2.0.0 queued locally')
      return true
    }

    send('220 localhost ESMTP local-test-sink')
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      if (dataMode) {
        message += chunk
        finishData()
        return
      }

      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)
        const upper = line.toUpperCase()
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          send('250-localhost')
          send('250 AUTH PLAIN LOGIN')
        } else if (upper.startsWith('AUTH')) {
          send('235 2.7.0 authenticated')
        } else if (upper.startsWith('MAIL FROM') || upper.startsWith('RCPT TO')) {
          send('250 2.1.0 accepted')
        } else if (upper === 'DATA') {
          dataMode = true
          send('354 End data with <CR><LF>.<CR><LF>')
        } else if (upper === 'QUIT') {
          send('221 2.0.0 bye')
          socket.end()
        } else {
          send('250 2.0.0 ok')
        }
      }
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(smtpPort, '127.0.0.1', () => resolve(server))
  })
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited: ${child.exitCode}\n${childOutput}`)
    try {
      if ((await fetch(`${apiBase}/api/health`)).ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error(`health timeout\n${childOutput}`)
}

async function postJson(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function waitForMessage(predicate) {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const match = capturedMessages.find(predicate)
    if (match) return match
    await sleep(50)
  }
  throw new Error(`SMTP message timeout; messages=${capturedMessages.length}`)
}

function mfaCodeFrom(message) {
  return message.match(/\b\d{6}\b/)?.[0]
}

function resetTokenFrom(message) {
  const encodedToken = message.match(/token(?:=3D|=)([a-f0-9]{64})/i)
  if (encodedToken) return encodedToken[1]
  const match = message.match(/https?:\/\/[^\s<>"']+/)
  if (!match) return null
  return new URL(match[0].replace(/[.)]+$/, '')).searchParams.get('token')
}

async function concurrent(count, fn) {
  return Promise.all(Array.from({ length: count }, (_, index) => fn(index)))
}

try {
  smtpServer = await startSmtpSink()
  child = spawn(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(apiPort),
      HOST: '127.0.0.1',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpPort),
      SMTP_USER: 'local-test',
      SMTP_PASS: 'local-test',
      SMTP_FROM: 'local-test@example.test',
      SMTP_TLS_REJECT_UNAUTHORIZED: 'false',
      MFA_ENABLED: 'true',
      TRUST_PROXY: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', chunk => { childOutput += chunk })
  child.stderr.on('data', chunk => { childOutput += chunk })
  await waitForHealth()

  const registered = await postJson('/api/auth/register', {
    fullName: 'Local Race Test',
    email: testEmail,
    cpf: makeCpf(),
    password: testPassword,
    cep: '01001000',
    street: 'Rua Local',
    number: '1',
    complement: '',
    district: 'Centro',
    city: 'Sao Paulo',
    state: 'SP'
  })
  if (registered.status !== 201) throw new Error(`registration failed: ${registered.status} ${JSON.stringify(registered.body)}`)

  const login = await postJson('/api/auth/login', { email: testEmail, password: testPassword })
  if (login.status !== 200 || !login.body.challengeId) throw new Error(`MFA login failed: ${login.status} ${JSON.stringify(login.body)}`)
  const loginMessage = await waitForMessage(message => mfaCodeFrom(message) && message.includes(testEmail))
  const code = mfaCodeFrom(loginMessage)
  const mfaResults = await concurrent(8, () => postJson('/api/auth/login/mfa/verify', { challengeId: login.body.challengeId, code }))

  const secondLogin = await postJson('/api/auth/login', { email: testEmail, password: testPassword })
  const secondMessage = await waitForMessage(message => mfaCodeFrom(message) && message.includes(testEmail) && message !== loginMessage)
  const wrongCode = mfaCodeFrom(secondMessage) === '999999' ? '000000' : '999999'
  const invalidResults = await concurrent(8, () => postJson('/api/auth/login/mfa/verify', { challengeId: secondLogin.body.challengeId, code: wrongCode }))
  const invalidSequentialResults = []
  for (let index = 0; index < 2; index += 1) {
    invalidSequentialResults.push(await postJson('/api/auth/login/mfa/verify', { challengeId: secondLogin.body.challengeId, code: wrongCode }))
  }
  const invalidChallenge = await prisma.mfaChallenge.findUnique({ where: { id: secondLogin.body.challengeId }, select: { attempts: true, usedAt: true } })

  await postJson('/api/auth/forgot-password', { email: testEmail })
  const resetMessage = await waitForMessage(message => resetTokenFrom(message))
  const resetToken = resetTokenFrom(resetMessage)
  const resetResults = await concurrent(8, () => postJson('/api/auth/reset-password', { token: resetToken, password: nextPassword }))

  const countStatus = results => results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1
    return counts
  }, {})
  const summary = {
    mode: 'local-auth-concurrency-race',
    safety: { api: apiBase, smtp: '127.0.0.1 only', database: 'local MariaDB', externalEmail: false, externalNetwork: false },
    mfaCorrect: { statuses: countStatus(mfaResults), successCount: mfaResults.filter(result => result.status === 200).length },
    mfaInvalid: {
      concurrentStatuses: countStatus(invalidResults),
      sequentialStatuses: countStatus(invalidSequentialResults),
      finalAttempts: invalidChallenge?.attempts,
      usedAtSet: Boolean(invalidChallenge?.usedAt)
    },
    passwordReset: { statuses: countStatus(resetResults), successCount: resetResults.filter(result => result.status === 200).length }
  }
  console.log(JSON.stringify(summary, null, 2))
  if (summary.mfaCorrect.successCount !== 1 || summary.passwordReset.successCount !== 1 || summary.mfaInvalid.finalAttempts !== 3 || !summary.mfaInvalid.usedAtSet) {
    throw new Error(`unexpected concurrency result: ${JSON.stringify(summary)}`)
  }
} finally {
  if (child) child.kill('SIGTERM')
  if (smtpServer) await new Promise(resolve => smtpServer.close(resolve))
  try { await prisma.user.delete({ where: { email: testEmail } }) } catch {}
  await prisma.$disconnect()
}
