const crypto = require('crypto');
const http = require('http');

const port = Number(process.env.PORT || 3000);
const webhookSecret = process.env.MOTORICAL_SMTP_WEBHOOK_SECRET;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyMotoricalSmtpSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (received.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expectedBuffer);
}

async function handleWebhook(req, res) {
  const rawBody = await readRawBody(req);
  const signature = req.headers['x-motorical-signature'];

  if (!verifyMotoricalSmtpSignature(rawBody, signature, webhookSecret)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid Motorical SMTP webhook signature' }));
    return;
  }

  const event = JSON.parse(rawBody.toString('utf8'));

  // Store event.id in your database before processing to make retries idempotent.
  console.log('Received Motorical SMTP webhook:', {
    id: event.id,
    type: event.type || event.eventType,
    messageId: event.messageId
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/webhooks/motorical-smtp') {
      await handleWebhook(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(port, () => {
  console.log(`Motorical SMTP webhook receiver listening on http://localhost:${port}`);
});
