import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const MAX_INPUT_BYTES = 64 * 1024
const WORKER_TIMEOUT_MS = 2_000

function normalizeAttrs(attrs = []) {
  return attrs
    .map(({ name, value }) => ({ name: String(name), value: String(value) }))
    .sort((a, b) => `${a.name}\0${a.value}`.localeCompare(`${b.name}\0${b.value}`))
}

function collectHtmlparser2(node, output = []) {
  for (const child of node.childNodes || []) {
    if (child.type === 'tag' || child.type === 'script' || child.type === 'style') {
      output.push({ tag: child.name, attrs: normalizeAttrs(Object.entries(child.attribs || {}).map(([name, value]) => ({ name, value }))) })
    }
    collectHtmlparser2(child, output)
  }
  return output
}

function collectParse5(node, output = []) {
  for (const child of node.childNodes || []) {
    if (child.tagName) output.push({ tag: child.tagName, attrs: normalizeAttrs(child.attrs) })
    collectParse5(child, output)
  }
  return output
}

function securityAttributes(nodes) {
  return nodes.flatMap(item =>
    item.attrs
      .filter(({ name }) => ['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name.toLowerCase()))
      .map(attribute => ({ tag: item.tag, ...attribute }))
  )
}

async function parseCase(html) {
  const htmlparser2 = await import('htmlparser2')
  const parse5 = await import('parse5')
  const h2 = collectHtmlparser2(htmlparser2.parseDocument(html))
  const p5 = collectParse5(parse5.parseFragment(html))
  const same = JSON.stringify(h2) === JSON.stringify(p5)
  return { same, h2, p5, h2SecurityAttributes: securityAttributes(h2), p5SecurityAttributes: securityAttributes(p5) }
}

function runWorker(html) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { html } })
    const timer = setTimeout(async () => {
      await worker.terminate()
      reject(new Error(`worker timeout after ${WORKER_TIMEOUT_MS}ms`))
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
  try {
    parentPort.postMessage({ ok: true, result: await parseCase(workerData.html) })
  } catch (error) {
    parentPort.postMessage({ ok: false, error: `${error.name}: ${error.message}` })
  }
} else {
  const cases = [
    '<a href="jav&#x61;script:alert(1)">link</a>',
    '<a href="java\u0000script:alert(1)">link</a>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<select><option>&lt;img src=x onerror=alert(1)&gt;</option></select>',
    '<textarea></textarea/><img src=x onerror=alert(1)>',
    '<xmp></xmp/><img src=x onerror=alert(1)>',
    '<div title="a\r\nonfocus=alert(1)">x</div>',
    '<table><tr><td><form><input name=x></form></td></tr></table>',
    '<p><div>misnested</p></div>',
    '<!--><script>text</script>',
    '<![CDATA[<img src=x onerror=alert(1)>]]>',
    '<math><mi><a href="javascript:alert(1)">x</a></mi></math>'
  ]

  for (const depth of [32, 128, 512, 1_024]) {
    cases.push(`${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)}`)
    cases.push(`${'<svg>'.repeat(depth)}x${'</svg>'.repeat(depth)}`)
  }

  const results = []
  for (const html of cases) {
    if (Buffer.byteLength(html, 'utf8') > MAX_INPUT_BYTES) throw new Error('input cap exceeded')
    try {
      const result = await runWorker(html)
      results.push({ input: html, bytes: Buffer.byteLength(html, 'utf8'), ...result })
    } catch (error) {
      results.push({ input: html, bytes: Buffer.byteLength(html, 'utf8'), ok: false, error: error.message })
    }
  }

  const divergences = results.filter(item => item.ok && !item.result.same)
  console.log(JSON.stringify({
    mode: 'offline-html-parser-differential',
    target: 'htmlparser2@12.0.0',
    oracle: 'parse5@8.0.1',
    safety: { maxInputBytes: MAX_INPUT_BYTES, workerTimeoutMs: WORKER_TIMEOUT_MS, network: false, render: false, executeHtml: false },
    summary: { cases: results.length, divergences: divergences.length, failures: results.filter(item => !item.ok).length },
    divergences: divergences.slice(0, 20).map(item => ({
      input: item.input,
      bytes: item.bytes,
      h2Tags: item.result.h2.map(node => node.tag),
      p5Tags: item.result.p5.map(node => node.tag),
      h2SecurityAttributes: item.result.h2SecurityAttributes,
      p5SecurityAttributes: item.result.p5SecurityAttributes
    })),
    failures: results.filter(item => !item.ok)
  }, null, 2))
}
