import express from 'express'
import requestIp from 'request-ip'
import { DEFAULT_BLOCKED_RANGES, evaluateIpPolicy, isLoopbackPeer } from '../security/ip-policy.js'

const router = express.Router()

router.use((req, res, next) => {
  if (process.env.SECURITY_LAB_ENABLED !== 'true') return res.status(404).json({ message: 'Laboratório de segurança desativado.' })
  if (!isLoopbackPeer(req.socket.remoteAddress)) return res.status(403).json({ message: 'Laboratório disponível somente via loopback.' })
  if (req.get('x-local-security-lab') !== 'enabled') return res.status(400).json({ message: 'Inclua X-Local-Security-Lab: enabled.' })
  return next()
})

router.post('/ip-decision', (req, res) => {
  const candidateIp = typeof req.body?.candidateIp === 'string' ? req.body.candidateIp : requestIp.getClientIp(req)
  const blockedRanges = Array.isArray(req.body?.blockedRanges) && req.body.blockedRanges.length > 0 ? req.body.blockedRanges : DEFAULT_BLOCKED_RANGES
  if (!candidateIp || blockedRanges.length > 32 || blockedRanges.some(range => typeof range !== 'string')) {
    return res.status(400).json({ message: 'candidateIp e blockedRanges devem conter valores válidos.' })
  }
  return res.json({
    mode: 'local-security-lab',
    peerAddress: req.socket.remoteAddress,
    expressIp: req.ip,
    detectedByRequestIp: requestIp.getClientIp(req),
    decision: evaluateIpPolicy(candidateIp, blockedRanges)
  })
})

export default router
