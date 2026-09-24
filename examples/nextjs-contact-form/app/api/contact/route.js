const API_URL = 'https://api.motorical.com/v1/send';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sanitize(value) {
  return String(value || '').trim().slice(0, 2000);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function POST(request) {
  const body = await request.json();
  const name = sanitize(body.name);
  const email = sanitize(body.email);
  const message = sanitize(body.message);

  if (!name || !email || !message) {
    return Response.json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `ApiKey ${required('MOTORICAL_SMTP_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `contact-${email}-${Date.now()}`
    },
    body: JSON.stringify({
      from: required('MOTORICAL_SMTP_FROM'),
      to: [required('MOTORICAL_SMTP_TO')],
      subject: `New contact form message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      html: `<p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p>${escapeHtml(message)}</p>`,
      dryRun: process.env.MOTORICAL_SMTP_DRY_RUN === 'true'
    })
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    return Response.json({ error: result.error || 'Unable to send message.' }, { status: 502 });
  }

  return Response.json({ ok: true, messageId: result.data && result.data.messageId });
}
