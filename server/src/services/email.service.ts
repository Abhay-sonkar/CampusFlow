import nodemailer from 'nodemailer';
import { env } from '../config/env';

// Real SMTP settings -> real emails. No settings -> we only print what would have been sent.
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT ?? 587),
      secure: Number(env.SMTP_PORT) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendEmail(message: { to: string; subject: string; text: string }) {
  if (!transport) {
    console.log(`[email] SMTP not configured, not sent -> to=${message.to} subject="${message.subject}"`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...message });
  console.log(`[email] sent -> to=${message.to} subject="${message.subject}"`);
}
