import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const MAX_INPUT_BYTES = 32_768
const WORKER_TIMEOUT_MS = 3_000

function timeCase(label, input, fn) {
  if (input.length > MAX_INPUT_BYTES) throw new Error(`${label} exceeded input cap`)
  const started = performance.now()
  let result
  try {
    result = fn(input)
  } catch (error) {
    result = `throws:${error.code || error.name}`
  }
  return {
    label,
    bytes: input.length,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    result: typeof result === 'boolean' ? result : typeof result === 'string' ? result : 'completed',
  }
}

function run(target) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { target } })
    const timer = setTimeout(async () => {
      await worker.terminate()
      reject(new Error(`${target} exceeded ${WORKER_TIMEOUT_MS}ms`))
    }, WORKER_TIMEOUT_MS)
    worker.once('message', value => {
      clearTimeout(timer)
      resolve(value)
    })
    worker.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

if (!isMainThread) {
  const target = workerData.target
  const rows = []

  if (target === 'nodemailer') {
    const addressparser = require('nodemailer/lib/addressparser')
    for (const count of [32, 128, 256, 512]) {
      rows.push(timeCase(`distinct-addresses-${count}`, Array.from({ length: count }, (_, i) => `u${i}@example.com`).join(','), addressparser))
      rows.push(timeCase(`comment-addresses-${count}`, Array.from({ length: count }, (_, i) => `u${i} (display) <u${i}@example.com>`).join(','), addressparser))
    }
  }

  if (target === 'zod') {
    const { z } = require('zod')
    const email = z.email()
    const password = z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/)
    for (const size of [64, 256, 1_024, 4_096, 16_384, 32_700]) {
      const half = Math.floor((size - 3) / 2)
      rows.push(timeCase(`email-invalid-${size}`, `${'a'.repeat(half)}@${'b'.repeat(half)}.x`, value => email.safeParse(value)))
      rows.push(timeCase(`password-invalid-${size}`, 'a'.repeat(size), value => password.safeParse(value)))
    }
  }

  if (target === 'qs') {
    const qs = require('qs')
    for (const depth of [4, 8, 16, 32, 64, 100]) {
      rows.push(timeCase(`nested-${depth}`, `root${'[x]'.repeat(depth)}=1`, value => qs.parse(value)))
    }
    for (const count of [100, 500, 1_000, 2_000]) {
      rows.push(timeCase(`pairs-${count}`, Array.from({ length: count }, (_, i) => `k${i}=x`).join('&'), value => qs.parse(value)))
    }
  }

  if (target === 'path-to-regexp') {
    const { match, parse } = require('path-to-regexp')
    const route = match('/console/:platform')
    for (const size of [64, 256, 1_024, 4_096, 16_384]) {
      rows.push(timeCase(`route-param-${size}`, `/console/${'a'.repeat(size)}`, value => route(value)))
    }
    rows.push(timeCase('compile-multi-param', '/:a-:b-:c', value => parse(value)))
  }

  if (target === 'minimatch') {
    const { minimatch } = require('minimatch')
    for (const size of [64, 256, 1_024, 4_096, 16_384]) {
      rows.push(timeCase(`globstar-${size}`, 'a/'.repeat(size / 2) + 'Z', value => minimatch(value, '**/**/**/Z')))
    }
  }

  if (target === 'brace-expansion') {
    const expand = require('brace-expansion').expand
    for (const depth of [2, 4, 6, 8, 10]) {
      rows.push(timeCase(`nested-braces-${depth}`, '{a,b}'.repeat(depth), expand))
    }
  }

  if (target === 'content-disposition') {
    const parse = require('content-disposition').parse
    for (const size of [64, 256, 1_024, 4_096, 16_384]) {
      rows.push(timeCase(`filename-${size}`, `attachment; filename="${'a'.repeat(size)}"`, parse))
    }
  }

  parentPort.postMessage({ target, rows })
} else {
  const targets = ['nodemailer', 'zod', 'qs', 'path-to-regexp', 'minimatch', 'brace-expansion', 'content-disposition']
  const results = await Promise.all(targets.map(run))
  console.log(JSON.stringify({
    mode: 'offline-focused-redos-review',
    safety: { maxInputBytes: MAX_INPUT_BYTES, workerTimeoutMs: WORKER_TIMEOUT_MS, network: false, appRequests: false },
    results,
  }, null, 2))
}
