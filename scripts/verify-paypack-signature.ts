/**
 * Verify a Paypack webhook signature from the terminal (same as Oazis).
 *
 * Usage:
 *   npx tsx scripts/verify-paypack-signature.ts \
 *     --body '{"kind":"transaction:processed",...}' \
 *     --signature '0TFCBdsZt8oZghXbkRLBIaMkYjXYelwNi0zp8xHZ4/w='
 *
 *   npx tsx scripts/verify-paypack-signature.ts \
 *     --body-file ./paypack-webhook-body.json \
 *     --signature '0TFCBdsZt8oZghXbkRLBIaMkYjXYelwNi0zp8xHZ4/w='
 *
 * Reads PAYPACK_WEBHOOK_SIGN_KEY from .env
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

config({ path: path.join(__dirname, "../.env") });

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const bodyFile = readArg("--body-file");
const bodyArg = readArg("--body");
const signature = readArg("--signature")?.trim();
const secret = process.env.PAYPACK_WEBHOOK_SIGN_KEY?.trim()?.replace(/^"|"$/g, "");

if (!secret) {
  console.error("Missing PAYPACK_WEBHOOK_SIGN_KEY in .env");
  process.exit(1);
}

if (!signature) {
  console.error("Pass --signature from x-paypack-signature header");
  process.exit(1);
}

let rawBody: string;
if (bodyFile) {
  rawBody = fs.readFileSync(path.resolve(bodyFile), "utf8");
} else if (bodyArg) {
  rawBody = bodyArg;
} else {
  console.error("Pass --body or --body-file (exact raw JSON from Paypack)");
  process.exit(1);
}

const expected = crypto
  .createHmac("sha256", secret)
  .update(rawBody)
  .digest("base64");

const valid = expected === signature;

console.log("--- Paypack webhook signature check ---");
console.log(`Body bytes:      ${Buffer.byteLength(rawBody, "utf8")}`);
console.log(`Secret length:   ${secret.length}`);
console.log(`Expected:        ${expected}`);
console.log(`Received:        ${signature}`);
console.log(`Valid:           ${valid ? "YES" : "NO"}`);

process.exit(valid ? 0 : 1);
