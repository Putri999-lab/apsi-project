import "server-only";

import { resolve } from "node:path";

const proofPathPattern = /^\/api\/customer\/payment-proofs\/([a-f0-9]{32}\.(?:jpg|png|webp|pdf))$/;

export function getPaymentProofDirectory() {
  return resolve(process.env.PAYMENT_PROOF_DIR ?? ".uploads/payment-proofs");
}

export function getPaymentProofFilename(proofUrl: string) {
  return proofPathPattern.exec(proofUrl)?.[1] ?? null;
}

export function paymentProofUrl(filename: string) {
  return `/api/customer/payment-proofs/${filename}`;
}

export function getPaymentProofType(filename: string) {
  const extension = filename.split(".").at(-1);
  switch (extension) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

export function isPaymentProofContentValid(bytes: Buffer, contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return bytes.length >= 8 && bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    case "image/webp":
      return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
    case "application/pdf":
      return bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
    default:
      return false;
  }
}
