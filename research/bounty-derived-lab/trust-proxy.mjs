import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 3_002
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SECURITY_LAB_ENABLED: 'true' },
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
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error(`health timeout\n${output}`)
}

async function probe(label, forwardedFor) {
  const headers = { 'x-local-security-lab': 'enabled', 'content-type': 'application/json' }
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor
  const response = await fetch(`${base}/api/security-lab/ip-decision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateIp: '203.0.113.10', blockedRanges: ['10.0.0.0/8'] })
  })
  return { label, status: response.status, body: await response.json() }
}

try {
  await waitForHealth()
  const results = [
    await probe('no-forwarded-for'),
    await probe('single-forwarded-for', '198.51.100.10'),
    await probe('two-forwarded-for', '198.51.100.10, 198.51.100.11')
  ]
  console.log(JSON.stringify({
    mode: 'local-trust-proxy-boundary-review',
    safety: { bind: '127.0.0.1', externalNetwork: false, route: 'loopback-gated security lab' },
    results
  }, null, 2))
} finally {
  child.kill('SIGTERM')
  await sleep(200)
}
