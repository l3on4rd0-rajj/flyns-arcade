import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.js'
import romRoutes from './routes/roms.js'
import usuarioRoutes from './routes/usuarios.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const dirname = path.dirname(fileURLToPath(import.meta.url))

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }))
app.use('/previews', express.static(path.join(dirname, 'previews')))
app.use('/rooms/covers', express.static(path.join(dirname, 'rooms', 'covers'), {
  dotfiles: 'deny',
  index: false
}))
app.use('/api/auth', authRoutes)
app.use('/api/roms', romRoutes)
app.use('/api/usuarios', usuarioRoutes)
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(dirname, 'dist')))
  app.get('*', (_req, res) => res.sendFile(path.join(dirname, 'dist', 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ message: err.message || 'Erro interno' })
})

app.listen(port, () => console.log(`Arcadia API em http://localhost:${port}`))
