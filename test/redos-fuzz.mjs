import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const MAX_CASE_BYTES = 16_384
const WORKER_TIMEOUT_MS = 5_000

function lcg(seed) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function buildRequestIpCorpus() {
  const corpus = []
  const lengths = [32, 64, 128, 256, 512, 1_024, 2_048, 4_096, 8_192, MAX_CASE_BYTES]
  const templates = [
    n => `1:${'1:'.repeat(n)}X`,
    n => `a:${'a:'.repeat(n)}g`,
    n => `${':'.repeat(n)}X`,
    n => `${'1'.repeat(n)}:`,
    n => `::${'1:'.repeat(n)}X`,
    n => `1:2:3:4:5:6:7:${'1:'.repeat(n)}X`,
    n => `[${'1:'.repeat(n)}X]`,
    n => `${'ffff:'.repeat(n)}::ffff`,
  ]

  for (const length of lengths) {
    for (const template of templates) corpus.push(template(length).slice(0, MAX_CASE_BYTES))
  }

  const random = lcg(0xA11CE)
  const alphabet = '0123456789abcdefABCDEF:.,[]xg% '
  for (let i = 0; i < 10_000; i += 1) {
    const length = 1 + Math.floor(random() * 512)
    let value = ''
    for (let j = 0; j < length; j += 1) value += alphabet[Math.floor(random() * alphabet.length)]
    corpus.push(value)
  }
  return corpus
}

function buildAppendFieldCorpus() {
  const corpus = []
  for (const depth of [1, 2, 4, 8, 16, 32, 64, 96, 100]) {
    corpus.push({ label: `depth-${depth}`, key: `root${'[x]'.repeat(depth)}` })
  }
  for (const width of [1, 10, 50, 100, 250, 500]) {
    corpus.push({ label: `fields-${width}`, key: 'root[x]'.repeat(width).slice(0, MAX_CASE_BYTES) })
  }
  return corpus
}

function runRequestIpWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { target: 'request-ip' } })
    const timer = setTimeout(async () => {
      await worker.terminate()
      reject(new Error(`request-ip worker exceeded ${WORKER_TIMEOUT_MS}ms`))
    }, WORKER_TIMEOUT_MS)
    worker.once('message', result => {
      clearTimeout(timer)
      resolve(result)
    })
    worker.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function runAppendFieldWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { target: 'append-field' } })
    const timer = setTimeout(async () => {
      await worker.terminate()
      reject(new Error(`append-field worker exceeded ${WORKER_TIMEOUT_MS}ms`))
    }, WORKER_TIMEOUT_MS)
    worker.once('message', result => {
      clearTimeout(timer)
      resolve(result)
    })
    worker.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

if (!isMainThread) {
  const started = performance.now()
  const maxCase = { elapsedMs: 0, inputBytes: 0, label: '' }

  if (process.env.NODE_OPTIONS?.includes('--max-old-space-size') === false) {
    // The parent process already bounds the corpus. This branch intentionally
    // avoids modifying the user's NODE_OPTIONS for a normal local run.
  }

  if (workerData.target === 'request-ip') {
    const requestIpIs = require('request-ip/lib/is')
    for (const input of buildRequestIpCorpus()) {
      const t = performance.now()
      requestIpIs.ip(input)
      const elapsedMs = performance.now() - t
      if (elapsedMs > maxCase.elapsedMs) Object.assign(maxCase, { elapsedMs, inputBytes: input.length, label: input.slice(0, 80) })
    }
    parentPort.postMessage({ target: 'request-ip', cases: 10_080, elapsedMs: performance.now() - started, maxCase })
  } else {
    const appendField = require('append-field')
    const corpus = buildAppendFieldCorpus()
    for (const item of corpus) {
      const t = performance.now()
      const store = Object.create(null)
      appendField(store, item.key, 'x')
      const elapsedMs = performance.now() - t
      if (elapsedMs > maxCase.elapsedMs) Object.assign(maxCase, { elapsedMs, inputBytes: item.key.length, label: item.label })
    }
    parentPort.postMessage({ target: 'append-field', cases: corpus.length, elapsedMs: performance.now() - started, maxCase })
  }
} else {
  const results = await Promise.all([runRequestIpWorker(), runAppendFieldWorker()])
  console.log(JSON.stringify({
    mode: 'offline-redos-fuzz',
    safety: {
      maxCaseBytes: MAX_CASE_BYTES,
      workerTimeoutMs: WORKER_TIMEOUT_MS,
      network: false,
      appRequests: false,
    },
    results,
  }, null, 2))
}
