import fs from 'node:fs'
import path from 'node:path'

export const toPublicRom = (item, existsSync = fs.existsSync) => {
  const { filePath, ...publicItem } = item
  return {
    ...publicItem,
    fileSize: Number(item.fileSize),
    available: Boolean(filePath && existsSync(path.resolve(filePath)))
  }
}
