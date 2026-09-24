const nodemailer = require('nodemailer');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function sendEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.MOTORICAL_SMTP_HOST || 'smtp.motorical.com',
    port: Number(process.env.MOTORICAL_SMTP_PORT || 587),
    secure: process.env.MOTORICAL_SMTP_PORT === '465',
    auth: {
      user: requireEnv('MOTORICAL_SMTP_USER'),
      pass: requireEnv('MOTORICAL_SMTP_PASSWORD')
    },
    requireTLS: true
  });

  const info = await transporter.sendMail({
    from: requireEnv('MOTORICAL_SMTP_FROM'),
    to: requireEnv('MOTORICAL_SMTP_TO'),
    subject: 'Hello from Motorical SMTP and Nodemailer',
    text: 'This message was sent through an SMTP Motor Block.',
    html: '<p>This message was sent through an <strong>SMTP Motor Block</strong>.</p>'
  });

  console.log('Motorical SMTP message sent:', info.messageId);
}

sendEmail().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
