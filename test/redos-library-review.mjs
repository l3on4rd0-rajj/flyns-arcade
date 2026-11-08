import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const TIMEOUT_MS = 3_000
const MAX_INPUT_BYTES = 32_768

function measure(label, input, fn) {
  const start = performance.now()
  fn(input)
  return {
    label,
    bytes: input.length,
    elapsedMs: Number((performance.now() - start).toFixed(3)),
  }
}

function runWorker(target) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { target } })
    const timer = setTimeout(async () => {
      await worker.terminate()
      reject(new Error(`${target} exceeded ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)
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
    for (const count of [32, 128, 256, 512, 1_024]) {
      const input = Array.from({ length: count }, (_, i) => `user${i}@example.com`).join(',')
      rows.push(measure(`addresses-${count}`, input, addressparser))
    }
  }

  if (target === 'zod') {
    const { z } = require('zod')
    const schema = z.email()
    for (const size of [64, 256, 1_024, 4_096, 16_384, MAX_INPUT_BYTES - 32]) {
      const input = `${'a'.repeat(size)}@example.com`
      rows.push(measure(`email-${size}`, input, value => schema.safeParse(value)))
    }
  }

  if (target === 'qs') {
    const qs = require('qs')
    for (const count of [32, 128, 512, 1_000, 2_000]) {
      const input = Array.from({ length: count }, (_, i) => `field${i}=x`).join('&')
      rows.push(measure(`pairs-${count}`, input, value => qs.parse(value)))
    }
  }

  if (target === 'negotiator') {
    const Negotiator = require('negotiator')
    for (const count of [32, 128, 512, 1_000, 2_000]) {
      const input = Array.from({ length: count }, (_, i) => `pt-BR;q=0.${i % 10}`).join(',')
      rows.push(measure(`languages-${count}`, input, value => new Negotiator({ headers: { 'accept-language': value } }).languages()))
    }
  }

  if (target === 'content-disposition') {
    const parse = require('content-disposition').parse
    for (const size of [64, 256, 1_024, 4_096, 16_384]) {
      const input = `attachment; filename="${'a'.repeat(size)}"`
      rows.push(measure(`filename-${size}`, input, parse))
    }
  }

  if (target === 'semver') {
    const semver = require('semver')
    for (const size of [64, 256, 1_024, 4_096, 16_384 - 16]) {
      const input = `${'1.'.repeat(size)}x`
      rows.push(measure(`version-${size}`, input, value => semver.validRange(value)))
    }
  }

  parentPort.postMessage({ target, rows, totalMs: Number(rows.reduce((sum, row) => sum + row.elapsedMs, 0).toFixed(3)) })
} else {
  const targets = ['nodemailer', 'zod', 'qs', 'negotiator', 'content-disposition', 'semver']
  const results = await Promise.all(targets.map(runWorker))
  console.log(JSON.stringify({
    mode: 'offline-dependency-redos-review',
    safety: { maxInputBytes: MAX_INPUT_BYTES, workerTimeoutMs: TIMEOUT_MS, network: false, appRequests: false },
    results,
  }, null, 2))
}
