import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateIpPolicy, isLoopbackPeer } from '../security/ip-policy.js'

test('policy blocks an IPv4 address inside a configured range', () => {
  assert.equal(evaluateIpPolicy('192.0.2.10', ['192.0.2.0/24']).blocked, true)
})

test('patched library normalizes abbreviated loopback IPv4 input', () => {
  assert.equal(evaluateIpPolicy('127.1', ['127.0.0.0/8']).blocked, true)
})

test('policy records the mapped IPv6 discrepancy without hiding it', () => {
  assert.equal(evaluateIpPolicy('::ffff:192.0.2.10', ['::ffff:192.0.2.0/120']).blocked, false)
})

test('loopback gate recognizes IPv4 and mapped loopback peers', () => {
  assert.equal(isLoopbackPeer('127.0.0.1'), true)
  assert.equal(isLoopbackPeer('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackPeer('192.0.2.20'), false)
})
