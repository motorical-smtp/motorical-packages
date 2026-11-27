'use strict';
// @motorical/sdk: one method per operationId in https://docs.motorical.com/openapi.json.
//   const { Motorical } = require('@motorical/sdk');
//   const m = new Motorical({ apiKey: process.env.MOTORICAL_API_KEY });
//   await m.sendEmail({ body: { from, to, subject, text, dryRun: true } });
// Errors throw MotoricalError with .status, .code (branch on it), .requestId and .body.
const { execute, buildRequest, MotoricalError } = require('./core');
const { OPERATIONS, OPENAPI_VERSION } = require('./operations');

class Motorical {
  constructor(config = {}) {
    this.config = { ...config };
    for (const op of OPERATIONS) {
      Object.defineProperty(this, op.id, { value: (args) => execute(op, args, this.config), enumerable: false });
    }
  }
}

module.exports = { Motorical, MotoricalError, OPERATIONS, OPENAPI_VERSION, buildRequest };
