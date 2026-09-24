const API_URL = 'https://api.motorical.com/v1/send';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function sendEmail() {
  const apiKey = requireEnv('MOTORICAL_SMTP_API_KEY');
  const from = requireEnv('MOTORICAL_SMTP_FROM');
  const to = requireEnv('MOTORICAL_SMTP_TO');
  const dryRun = process.env.MOTORICAL_SMTP_DRY_RUN !== 'false';

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `example-${Date.now()}`
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: dryRun ? 'Motorical SMTP dry run' : 'Hello from Motorical SMTP',
      text: 'This message was sent with the Motorical SMTP HTTP Send API.',
      html: '<p>This message was sent with the <strong>Motorical SMTP</strong> HTTP Send API.</p>',
      dryRun
    })
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Motorical SMTP send failed with ${response.status}`);
  }

  console.log(JSON.stringify(result, null, 2));
}

sendEmail().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
