import net from 'node:net'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import nodemailer from 'nodemailer'

const apiPort = 3_001
const smtpPort = 2_525
const apiBase = `http://127.0.0.1:${apiPort}`
const testEmail = process.env.ALEXANDRIA_TEST_EMAIL
const testPassword = process.env.ALEXANDRIA_TEST_PASSWORD
const capturedMessages = []
const smtpTrace = []
let childOutput = ''

if (!testEmail || !testPassword) {
  throw new Error('ALEXANDRIA_TEST_EMAIL and ALEXANDRIA_TEST_PASSWORD are required')
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function startSmtpSink() {
  const server = net.createServer(socket => {
    smtpTrace.push('CONNECTION')
    let buffer = ''
    let dataMode = false
    let message = ''
    let authState = null
    const send = value => socket.write(`${value}\r\n`)
    const finishData = () => {
      const markerMatch = message.match(/\r?\n\.\r?\n/)
      if (!markerMatch || markerMatch.index === undefined) return false
      capturedMessages.push(message.slice(0, markerMatch.index))
      message = message.slice(markerMatch.index + markerMatch[0].length)
      dataMode = false
      send('250 2.0.0 queued locally')
      return true
    }

    send('220 localhost ESMTP local-test-sink')
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      if (dataMode) {
        smtpTrace.push(`DATA_CHUNK:${chunk.length}:${JSON.stringify(chunk.slice(-20))}`)
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
        smtpTrace.push(upper.slice(0, 120))

        if (authState === 'user') {
          authState = 'pass'
          send('334 UGFzc3dvcmQ6')
        } else if (authState === 'pass') {
          authState = null
          send('235 2.7.0 authenticated')
        } else if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          send('250-localhost')
          send('250-AUTH PLAIN LOGIN')
          send('250 SIZE 1000000')
        } else if (upper.startsWith('AUTH LOGIN')) {
          authState = 'user'
          send('334 VXNlcm5hbWU6')
        } else if (upper.startsWith('AUTH PLAIN')) {
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
      if (dataMode && buffer) {
        message += buffer
        buffer = ''
        finishData()
      }
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(smtpPort, '127.0.0.1', () => {
      smtpTrace.push(`LISTEN:${smtpPort}`)
      resolve(server)
    })
  })
}

async function waitForHealth(child) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited with code ${child.exitCode}`)
    try {
      const response = await fetch(`${apiBase}/api/health`)
      if (response.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error('API health check timed out')
}

async function postJson(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: response.status, body: await response.json() }
}

async function waitForCode() {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const code = capturedMessages.join('\n').match(/\b\d{6}\b/)?.[0]
    if (code) return code
    await sleep(50)
  }
  throw new Error(`MFA code was not captured by local SMTP sink\nLogin: ${JSON.stringify(login)}\nSMTP: ${smtpTrace.join(' | ')}\n${childOutput.slice(-2_000)}`)
}

async function uploadCase(label, filename, fieldCount) {
  const form = new FormData()
  form.append('platform', 'GBA')
  form.append('title', 'x')
  form.append('genre', 'RPG')
  for (let index = 0; index < fieldCount; index += 1) {
    form.append(`field[${index}][nested]`, 'x')
  }
  form.append('file', new Blob(['x'], { type: 'application/octet-stream' }), filename)
  form.append('cover', new Blob(['x'], { type: 'image/png' }), 'cover.png')
  const started = performance.now()
  const response = await fetch(`${apiBase}/api/roms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${globalThis.token}` },
    body: form,
    signal: AbortSignal.timeout(3_000)
  })
  await response.arrayBuffer()
  return { label, status: response.status, elapsedMs: Number((performance.now() - started).toFixed(3)) }
}

const smtp = await startSmtpSink()
const probeTransport = nodemailer.createTransport({
  host: '127.0.0.1',
  port: smtpPort,
  auth: { user: 'local-test', pass: 'local-test' }
})
await probeTransport.sendMail({
  from: 'local-test@example.test',
  to: 'local-test@example.test',
  subject: 'local sink probe',
  text: 'probe'
})
await probeTransport.close()
const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_USER: 'local-test',
    SMTP_PASS: 'local-test',
    SMTP_TLS_REJECT_UNAUTHORIZED: 'false',
    MFA_ENABLED: 'true'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', chunk => { childOutput += chunk })
child.stderr.on('data', chunk => { childOutput += chunk })

let login
let token
const cases = []
try {
  await waitForHealth(child)
  login = await postJson('/api/auth/login', { email: testEmail, password: testPassword })
  if (login.status !== 200 || !login.body.requiresMfa) {
    throw new Error(`Expected MFA login, received HTTP ${login.status}`)
  }
  const code = await waitForCode()
  const verified = await postJson('/api/auth/login/mfa/verify', {
    challengeId: login.body.challengeId,
    code
  })
  if (verified.status !== 200 || !verified.body.token) {
    throw new Error(`MFA verification failed with HTTP ${verified.status}`)
  }
  token = verified.body.token
  globalThis.token = token

  cases.push(await uploadCase('authenticated-multipart-500-nested-fields', 'sample.gba', 500))
  cases.push(await uploadCase('authenticated-multipart-16kb-filename', `${'a'.repeat(16_000)}.gba`, 10))
} finally {
  child.kill('SIGTERM')
  await sleep(300)
  smtp.close()
}

console.log(JSON.stringify({
  mode: 'authenticated-local-http-redos-review',
  apiBase,
  smtpSink: '127.0.0.1 only',
  emailSentExternally: false,
  loginStatus: login?.status,
  capturedMessages: capturedMessages.length,
  cases
}, null, 2))
