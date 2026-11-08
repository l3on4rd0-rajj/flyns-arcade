const configuredSecret = process.env.JWT_SECRET?.trim()

if (process.env.NODE_ENV === 'production' && !configuredSecret) {
  throw new Error('JWT_SECRET must be configured in production')
}

export const jwtSecret = configuredSecret || 'arcadia-dev-secret'
