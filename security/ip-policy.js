import ipRangeCheck from 'ip-range-check'

export const DEFAULT_BLOCKED_RANGES = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8',
  '::1/128', 'fc00::/7', '169.254.0.0/16', '::ffff:169.254.0.0/112'
]

export const evaluateIpPolicy = (candidateIp, blockedRanges = DEFAULT_BLOCKED_RANGES) => ({
  candidateIp,
  blockedRanges,
  blocked: ipRangeCheck(candidateIp, blockedRanges),
  library: 'ip-range-check@0.2.1'
})

export const isLoopbackPeer = (address = '') => {
  const normalized = String(address).replace(/^::ffff:/i, '')
  return normalized === '127.0.0.1' || normalized === '::1'
}
