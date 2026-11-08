import { performance } from 'node:perf_hooks'

const baseUrl = process.env.ALEXANDRIA_BASE_URL || 'http://127.0.0.1:3000'
const base = new URL(baseUrl)
const maxRequestBytes = 32 * 1024
const timeoutMs = 3_000

if (!['127.0.0.1', 'localhost', '::1'].includes(base.hostname)) {
  throw new Error(`Refusing non-local target: ${base.hostname}`)
}

const cases = []

async function hit(label, path, init = {}) {
  const bodyBytes = init.body ? Buffer.byteLength(String(init.body)) : 0
  if (bodyBytes > maxRequestBytes) throw new Error(`${label} exceeded request cap`)

  const started = performance.now()
  try {
    const response = await fetch(new URL(path, base), {
      ...init,
      signal: AbortSignal.timeout(timeoutMs)
    })
    await response.arrayBuffer()
    cases.push({ label, status: response.status, bodyBytes, elapsedMs: Number((performance.now() - started).toFixed(3)) })
  } catch (error) {
    cases.push({ label, error: `${error.name}:${error.message}`, bodyBytes, elapsedMs: Number((performance.now() - started).toFixed(3)) })
  }
}

await hit('health', '/api/health')

for (const size of [64, 256, 1_024, 4_096, 16_000]) {
  await hit(`rom-query-value-${size}`, `/api/roms?q=${encodeURIComponent('a'.repeat(size))}`)
}

for (const depth of [4, 16, 32, 64, 100]) {
  const key = Array.from({ length: depth }, () => '[a]').join('')
  await hit(`rom-query-nested-${depth}`, `/api/roms?a${key}=x`)
}

const pairs = Array.from({ length: 2_000 }, (_, index) => `k${index}=x`).join('&')
await hit('rom-query-2000-pairs', `/api/roms?${pairs}`)

for (const size of [64, 256, 1_024, 4_096, 16_000]) {
  const body = JSON.stringify({ email: `${'a'.repeat(size)}@invalid`, password: 'A1aaaaaa' })
  await hit(`login-invalid-email-${size}`, '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  })
}

const form = new FormData()
form.append('platform', 'GBA')
form.append('title', 'local-redos-boundary')
form.append('file', new Blob(['x']), 'sample.gba')
await hit('unauthenticated-multipart-boundary', '/api/roms', { method: 'POST', body: form })

console.log(JSON.stringify({
  mode: 'local-http-redos-review',
  baseUrl: base.origin,
  safety: { maxRequestBytes, timeoutMs, network: 'localhost-only', externalEmail: false },
  cases
}, null, 2))
