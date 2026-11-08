import nodemailer from 'nodemailer'

const port = Number(process.env.SMTP_PORT || 587)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port,
  secure: port === 465,
  auth: process.env.SMTP_USER && process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  tls: {
    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
  }
})


export async function sendSecurityEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER e SMTP_PASS precisam estar configurados.')
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  })
}

export default transporter
