import { performance } from 'node:perf_hooks'
import * as htmlparser2 from 'htmlparser2'
import * as parse5 from 'parse5'
import sanitizeHtml from 'sanitize-html'

const MAX_INPUT_BYTES = 4096
const MAX_CASES = 5000
const dangerousSchemes = /^(?:\s|\u0000)*javascript\s*:/i
const eventAttribute = /^on[a-z]+$/i

function collect(node, output = []) {
  for (const child of node.childNodes || []) {
    if (child.type === 'tag' || child.type === 'script' || child.type === 'style') {
      output.push({
        tag: child.name,
        attrs: Object.entries(child.attribs || {}).map(([name, value]) => ({ name, value }))
      })
    }
    collect(child, output)
  }
  return output
}

function collectParse5(node, output = []) {
  for (const child of node.childNodes || []) {
    if (child.tagName) output.push({ tag: child.tagName, attrs: child.attrs })
    collectParse5(child, output)
  }
  return output
}

function risky(nodes) {
  return nodes.flatMap(node => node.attrs
    .filter(attribute => eventAttribute.test(attribute.name) || dangerousSchemes.test(attribute.value))
    .map(attribute => ({ tag: node.tag, ...attribute })))
}

function makeCases() {
  const cases = new Set()
  const controls = ['', '\u0000', '\r', '\n', '\t', '\f', '&#0;', '&#x0;', '&#x0D;', '&#x0A;']
  const attrs = ['href', 'xlink:href', 'action', 'formaction', 'src']
  const tags = ['a', 'form', 'img', 'svg', 'textarea', 'option']
  const closers = ['</textarea/>', '</textarea>', '</xmp/>', '</xmp>', '</script/>', '</script>']

  for (const control of controls) {
    for (const attr of attrs) {
      for (const tag of tags) {
        cases.add(`<${tag} ${attr}="java${control}script:alert(1)">x</${tag}>`)
        cases.add(`<${tag} ${attr}="jav${control}ascript:alert(1)">x</${tag}>`)
      }
    }
  }
  for (const closer of closers) {
    for (const prefix of ['', '<div>', '<svg>', '<select><option>']) {
      cases.add(`${prefix}<textarea>safe${closer}<img src=x onerror=alert(1)>`)
      cases.add(`${prefix}<xmp>safe${closer}<img src=x onerror=alert(1)>`)
    }
  }
  for (let i = 0; i < 1500 && cases.size < MAX_CASES; i += 1) {
    const control = controls[i % controls.length]
    const attr = attrs[i % attrs.length]
    const tag = tags[i % tags.length]
    const nesting = '<svg>'.repeat(i % 5)
    const closing = '</svg>'.repeat(i % 5)
    const entity = i % 2 ? '&#x61;' : '&#97;'
    cases.add(`${nesting}<${tag} ${attr}="j${entity}vascript:${control}alert(1)">x</${tag}>${closing}`)
  }
  return [...cases].slice(0, MAX_CASES)
}

const options = {
  allowedTags: ['a', 'form', 'img', 'svg', 'textarea', 'option', 'select', 'xmp'],
  allowedAttributes: {
    a: ['href', 'xlink:href'],
    form: ['action'],
    img: ['src'],
    svg: [],
    textarea: [],
    option: [],
    select: [],
    xmp: []
  }
}

const started = performance.now()
const stats = { cases: 0, parserDivergences: 0, securityDivergences: 0, sanitizerFindings: [] }
const examples = []

for (const html of makeCases()) {
  if (Buffer.byteLength(html, 'utf8') > MAX_INPUT_BYTES) continue
  const h2 = collect(htmlparser2.parseDocument(html))
  const p5 = collectParse5(parse5.parseFragment(html))
  const h2Risk = risky(h2)
  const p5Risk = risky(p5)
  const sanitized = sanitizeHtml(html, options)
  const sanitizedRisk = risky(collectParse5(parse5.parseFragment(sanitized)))
  stats.cases += 1
  if (JSON.stringify(h2) !== JSON.stringify(p5)) stats.parserDivergences += 1
  if (JSON.stringify(h2Risk) !== JSON.stringify(p5Risk)) {
    stats.securityDivergences += 1
    if (examples.length < 20) examples.push({ kind: 'parser-security-difference', html, h2Risk, p5Risk })
  }
  if (sanitizedRisk.length > 0) {
    stats.sanitizerFindings.push({ html, sanitized, sanitizedRisk })
    if (stats.sanitizerFindings.length >= 20) break
  }
}

console.log(JSON.stringify({
  mode: 'offline-htmlparser2-security-fuzz',
  target: 'htmlparser2@12.0.0',
  consumer: 'sanitize-html@2.18.0',
  safety: { maxInputBytes: MAX_INPUT_BYTES, network: false, render: false, executeHtml: false },
  elapsedMs: Number((performance.now() - started).toFixed(3)),
  stats,
  examples
}, null, 2))
