import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const qs = require('qs')
const jwt = require('jsonwebtoken')
const baseUrl = process.env.ALEXANDRIA_BASE_URL || 'http://127.0.0.1:3000'
const base = new URL(baseUrl)

if (!['127.0.0.1', 'localhost', '::1'].includes(base.hostname)) {
  throw new Error(`Refusing non-local target: ${base.hostname}`)
}

const results = []

async function httpCase(label, path, init = {}, check = () => true) {
  const started = performance.now()
  try {
    const response = await fetch(new URL(path, base), {
      ...init,
      signal: AbortSignal.timeout(3_000)
    })
    const body = await response.text()
    results.push({ label, status: response.status, elapsedMs: Number((performance.now() - started).toFixed(3)), check: check(response, body) })
  } catch (error) {
    results.push({ label, error: `${error.name}:${error.message}`, elapsedMs: Number((performance.now() - started).toFixed(3)) })
  }
}

const health = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(3_000) })
if (!health.ok) throw new Error(`API health failed with ${health.status}`)

await httpCase('helmet-csp-and-nosniff', '/api/health', {}, (response) =>
  Boolean(response.headers.get('content-security-policy')) && response.headers.get('x-content-type-options') === 'nosniff')

await httpCase('cors-rejects-untrusted-origin', '/api/health', {
  headers: { origin: 'https://attacker.invalid' }
}, (response) => response.headers.get('access-control-allow-origin') !== 'https://attacker.invalid')

const oversizedJson = JSON.stringify({ email: `${'a'.repeat(40_000)}@invalid`, password: 'A1aaaaaa' })
await httpCase('express-json-limit', '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: oversizedJson
}, (response) => response.status === 413)

await httpCase('prisma-filter-metacharacters', `/api/roms?q=${encodeURIComponent("' OR 1=1 --")}&genre=${encodeURIComponent('"; DROP TABLE Rom;--')}`, {},
  (response) => response.status === 200 || response.status === 500)

await httpCase('public-openapi-no-secret', '/api-docs.json', {}, (_response, body) => !body.includes('JWT_SECRET') && !body.includes('SMTP_PASS'))

const protoBefore = {}.polluted
const protoResult = qs.parse('__proto__[polluted]=yes', { allowPrototypes: true })
results.push({
  label: 'qs-prototype-pollution-guard',
  check: protoBefore === undefined && ({}).polluted === undefined && Object.keys(protoResult).length === 0
})

const manyParameters = Array.from({ length: 2_000 }, (_, index) => `k${index}=x`).join('&')
const qsStarted = performance.now()
const manyResult = qs.parse(manyParameters)
results.push({
  label: 'qs-parameter-limit',
  elapsedMs: Number((performance.now() - qsStarted).toFixed(3)),
  keys: Object.keys(manyResult).length,
  check: Object.keys(manyResult).length <= 1_000
})

const deepKey = `a${'[b]'.repeat(50)}=x`
const deepStarted = performance.now()
const deepResult = qs.parse(deepKey)
results.push({
  label: 'qs-depth-limit',
  elapsedMs: Number((performance.now() - deepStarted).toFixed(3)),
  check: JSON.stringify(deepResult).length < 2_000
})

const unsignedToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6ImFkbWluIn0.'
let algNoneRejected = false
try {
  jwt.verify(unsignedToken, 'local-test-secret')
} catch {
  algNoneRejected = true
}
results.push({ label: 'jwt-alg-none-rejected', check: algNoneRejected })

console.log(JSON.stringify({
  mode: 'local-dependency-risk-scenarios',
  target: base.origin,
  network: 'localhost-only',
  externalSideEffects: false,
  results
}, null, 2))
