import test from 'node:test'
import assert from 'node:assert/strict'
import { toPublicRom } from '../utils/rom-public.js'

test('public ROM projection omits the server filesystem path', () => {
  const result = toPublicRom({
    id: 'rom-1',
    title: 'Local test',
    fileName: 'game.gba',
    filePath: 'C:\\private\\rooms\\gba\\game.gba',
    fileSize: 123n
  }, () => true)

  assert.equal(result.fileName, 'game.gba')
  assert.equal(result.fileSize, 123)
  assert.equal(result.available, true)
  assert.equal('filePath' in result, false)
})
