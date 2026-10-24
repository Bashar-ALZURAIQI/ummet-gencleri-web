import nodemailer from 'nodemailer';
import { createMailRelayHandler } from '../src/server/mailRelayCore.mjs';

const DEFAULT_SENDER = 'ummetgencleribirligi@gmail.com';
const transportOptions = (config) => ({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: config.GMAIL_SMTP_USER,
    password: config.GMAIL_SMTP_APP_PASSWORD.replace(/\s/g, ''),
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

export default createMailRelayHandler({
  getConfig: () => ({
    MAIL_RELAY_SECRET: process.env.MAIL_RELAY_SECRET,
    GMAIL_SMTP_APP_PASSWORD: process.env.GMAIL_SMTP_APP_PASSWORD,
    GMAIL_SMTP_USER: process.env.GMAIL_SMTP_USER || DEFAULT_SENDER,
  }),
  async sendMail(message, config) {
    const transport = nodemailer.createTransport(transportOptions(config));
    try {
      return await transport.sendMail({
        from: { name: 'Ümmet Gençleri Birliği', address: config.GMAIL_SMTP_USER },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { 'X-Union-Notification': message.notificationId },
      });
    } finally {
      transport.close();
    }
  },
});
