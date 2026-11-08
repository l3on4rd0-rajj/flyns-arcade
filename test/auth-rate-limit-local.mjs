import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 3_003
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MFA_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited: ${child.exitCode}\n${output}`)
    try {
      if ((await fetch(`${base}/api/health`)).ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error(`health timeout\n${output}`)
}

try {
  await waitForHealth()
  const statuses = []
  for (let index = 0; index < 35; index += 1) {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: '' })
    })
    statuses.push(response.status)
  }
  const firstLimited = statuses.indexOf(429)
  if (firstLimited < 0) throw new Error(`route limiter did not trigger: ${statuses.join(',')}`)
  console.log(JSON.stringify({
    mode: 'local-auth-route-rate-limit',
    safety: { bind: '127.0.0.1', database: false, externalEmail: false, externalNetwork: false },
    requests: statuses.length,
    firstLimitedRequest: firstLimited + 1,
    statusTail: statuses.slice(-5)
  }, null, 2))
} finally {
  child.kill('SIGTERM')
  await sleep(200)
}
