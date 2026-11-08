import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const requestIpIs = require('request-ip/lib/is')
const appendField = require('append-field')

const MAX_INPUT = 16_384
const MAX_CASE_MS = 250

function measure(label, input, fn, repetitions) {
  // Warm up the V8 path before measuring it.
  for (let i = 0; i < 10; i += 1) fn(input)

  const start = performance.now()
  let result
  for (let i = 0; i < repetitions; i += 1) result = fn(input)
  const elapsed = performance.now() - start

  if (elapsed > MAX_CASE_MS) {
    throw new Error(`${label} exceeded the local safety budget: ${elapsed.toFixed(2)}ms`)
  }

  return {
    label,
    bytes: input.length,
    repetitions,
    elapsedMs: Number(elapsed.toFixed(3)),
    perCallUs: Number(((elapsed * 1000) / repetitions).toFixed(3)),
    result: typeof result === 'boolean' ? result : 'completed',
  }
}

function requestIpCases(size) {
  return [
    ['ipv6-colon-tail', `1:${'1:'.repeat(Math.floor(size / 2))}X`.slice(0, size)],
    ['ipv6-hex-tail', `a:${'a:'.repeat(Math.floor(size / 2))}g`.slice(0, size)],
    ['ipv6-colon-run', `${':'.repeat(size)}X`],
    ['ipv6-hex-run', `${'1'.repeat(size)}:`],
    ['ipv6-mixed', `1:2:3:4:5:6:7:${'1:'.repeat(size)}X`.slice(0, size)],
  ]
}

function appendFieldInput(depth) {
  return `root${'[x]'.repeat(depth)}`
}

const requestIpRows = []
for (const size of [128, 512, 2_048, 8_192, MAX_INPUT]) {
  for (const [label, input] of requestIpCases(size)) {
    requestIpRows.push(measure(`request-ip/${label}`, input, value => requestIpIs.ip(value), 20))
  }
}

const appendFieldRows = []
for (const depth of [4, 8, 16, 32, 64]) {
  const key = appendFieldInput(depth)
  const row = measure(`append-field/depth-${depth}`, key, value => {
    const store = Object.create(null)
    appendField(store, value, 'x')
    return store
  }, 20)
  row.depth = depth
  appendFieldRows.push(row)
}

console.log(JSON.stringify({
  mode: 'offline-redos-screening',
  safety: {
    maxInputBytes: MAX_INPUT,
    maxCaseMs: MAX_CASE_MS,
    network: false,
    appRequests: false,
  },
  requestIp: requestIpRows,
  appendField: appendFieldRows,
}, null, 2))
