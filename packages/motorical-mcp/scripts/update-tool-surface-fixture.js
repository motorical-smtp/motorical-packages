import fs from 'node:fs';
import { createMotoricalMcpServer } from '../src/server.js';
import { toolSurface } from '../test/helpers/toolSurface.js';

const stubClient = new Proxy({}, { get: () => async () => ({}) });
const { server } = createMotoricalMcpServer({ client: stubClient });
const fixtureUrl = new URL('../test/fixtures/tool-surface.json', import.meta.url);

fs.writeFileSync(fixtureUrl, `${JSON.stringify(toolSurface(server), null, 2)}\n`);
