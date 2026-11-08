import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.js'
import romRoutes from './routes/roms.js'
import usuarioRoutes from './routes/usuarios.js'
import profileRoutes from './routes/profile.js'
import openapi from './docs/openapi.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const rawTrustProxy = process.env.TRUST_PROXY
const trustProxy = rawTrustProxy === 'true'
  ? 1
  : rawTrustProxy === 'false' || !rawTrustProxy
    ? false
    : /^\d+$/.test(rawTrustProxy)
      ? Number(rawTrustProxy)
      : rawTrustProxy

app.set('trust proxy', trustProxy)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: null
    }
  }
}))
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }))
app.use('/previews', express.static(path.join(dirname, 'previews')))
app.use('/rooms/covers', express.static(path.join(dirname, 'rooms', 'covers'), {
  dotfiles: 'deny',
  index: false
}))
app.get('/api-docs.json', (_req, res) => res.json(openapi))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'Arcadia Vault API Docs',
  swaggerOptions: {
    deepLinking: true,
    persistAuthorization: true,
    displayRequestDuration: true
  }
}))
app.use('/api/auth', authRoutes)
app.use('/api/roms', romRoutes)
app.use('/api/usuarios', usuarioRoutes)
app.use('/api/profile', profileRoutes)
if (process.env.SECURITY_LAB_ENABLED === 'true') {
  const { default: securityLabRoutes } = await import('./routes/security-lab.js')
  app.use('/api/security-lab', securityLabRoutes)
}
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(dirname, 'dist')))
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dirname, 'dist', 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ message: err.message || 'Erro interno' })
})

app.listen(port, host, () => console.log(`Arcadia API em http://${host}:${port}`))
