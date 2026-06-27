import crypto from 'crypto';
import db from '../db/client.js';

/**
 * RSA signature verification middleware.
 * Verifies that the incoming SMS payload was signed by the registered device's private key.
 * 
 * Expected request body fields:
 *   - device_id: ID of the registered device
 *   - sender_identity: SMS sender address
 *   - message_payload: SMS body text
 *   - timestamp: ISO 8601 timestamp
 *   - signature: Base64-encoded RSA signature
 */
export async function verifySignature(req, res, next) {
  try {
    const { device_id, sender_identity, message_payload, timestamp, signature } = req.body;

    if (!device_id || !signature) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'device_id and signature are required.',
      });
    }

    // Look up the device's public key, ensuring it belongs to the authenticated user
    const result = await db.execute({
      sql: 'SELECT public_key FROM devices WHERE id = ? AND user_id = ?',
      args: [device_id, req.user.id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'No device registered with that ID for your account.',
      });
    }

    const publicKeyPem = result.rows[0].public_key;

    // Reconstruct the signed data: concatenation of sender + payload + timestamp
    const signedData = `${sender_identity}${message_payload}${timestamp}`;

    // Verify the RSA signature using SHA-256 with PKCS1 padding
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedData, 'utf-8');
    verifier.end();

    const isValid = verifier.verify(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(signature, 'base64')
    );

    if (!isValid) {
      return res.status(403).json({
        error: 'Signature verification failed',
        message: 'The payload signature does not match the registered device key.',
      });
    }

    // Signature valid — attach device info and continue
    req.deviceId = device_id;
    next();
  } catch (error) {
    console.error('[CRYPTO] ❌ Signature verification error:', error.message);
    return res.status(500).json({
      error: 'Verification error',
      message: 'An error occurred during signature verification.',
    });
  }
}
