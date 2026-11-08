import express from 'express'
import multer from 'multer'
import { performance } from 'node:perf_hooks'

const maxRequestBytes = 2 * 1024 * 1024
const timeoutMs = 5_000
const fieldCounts = [10, 100, 1_000, 5_000]

const makeUpload = limits => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 64 * 1024,
    files: 2,
    ...limits
  }
})

async function runCase(label, limits, fieldCount) {
  const app = express()
  const upload = makeUpload(limits)
  app.post('/upload', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), (req, res) => {
    res.json({ fields: Object.keys(req.body).length, files: Object.keys(req.files || {}).length })
  })
  app.use((error, _req, res, _next) => res.status(400).json({ code: error.code || 'ERR', message: error.message }))

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    instance.once('error', reject)
  })

  try {
    const form = new FormData()
    form.append('platform', 'GBA')
    form.append('title', 'local-test')
    form.append('genre', 'RPG')
    for (let index = 0; index < fieldCount; index += 1) {
      form.append(`field[${index}][nested]`, 'x')
    }
    form.append('file', new Blob(['x'], { type: 'application/octet-stream' }), 'sample.gba')
    const started = performance.now()
    const response = await fetch(`http://127.0.0.1:${server.address().port}/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const body = await response.text()
    const elapsedMs = Number((performance.now() - started).toFixed(3))
    const requestBytes = Buffer.byteLength(body) + fieldCount
    return { label, fieldCount, status: response.status, elapsedMs, requestBytes, body: body.slice(0, 180) }
  } catch (error) {
    return { label, fieldCount, error: `${error.name}:${error.message}` }
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

const cases = []
for (const fieldCount of fieldCounts) {
  cases.push(await runCase('app-like-unbounded-parts', {}, fieldCount))
}
for (const fieldCount of fieldCounts) {
  cases.push(await runCase('alexandria-bounded-parts-fields-headers', {
    fields: 64,
    parts: 66,
    fieldNameSize: 128,
    fieldSize: 8 * 1024,
    headerPairs: 200
  }, fieldCount))
}

console.log(JSON.stringify({
  mode: 'local-multipart-resource-amplification',
  target: `multer@${process.env.npm_package_version || 'installed'}`,
  safety: { maxRequestBytes, timeoutMs, bind: '127.0.0.1', network: false, externalSideEffects: false },
  cases
}, null, 2))
