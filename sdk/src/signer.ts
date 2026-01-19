import { QuresisKeyPair } from './keypair';
import type { QuantumSignature, MLDSAVariant } from './types';
import { hashMessage } from './utils';

/**
 * QuresisSigner - High-level signing abstraction
 * 
 * Provides a convenient interface for signing messages with quantum-resistant
 * signatures, compatible with Solana transaction signing patterns.
 * 
 * @example
 * ```typescript
 * const keypair = QuresisKeyPair.generate('ML-DSA-44');
 * const signer = new QuresisSigner(keypair);
 * 
 * // Sign a transfer message
 * const message = new TextEncoder().encode('Transfer 1000 tokens');
 * const signature = await signer.sign(message);
 * 
 * // Verify
 * const isValid = signer.verify(message, signature.bytes);
 * ```
 */
export class QuresisSigner {
    readonly keypair: QuresisKeyPair;

    constructor(keypair: QuresisKeyPair) {
        this.keypair = keypair;
    }

    /**
     * Get the public key bytes for on-chain registration
     */
    get publicKey(): Uint8Array {
        return this.keypair.publicKey;
    }

    /**
     * Get the ML-DSA variant
     */
    get variant(): MLDSAVariant {
        return this.keypair.variant;
    }

    /**
     * Sign a message and return a QuantumSignature
     * 
     * @param message - Message bytes to sign
     * @returns QuantumSignature with metadata
     */
    async sign(message: Uint8Array): Promise<QuantumSignature> {
        const bytes = this.keypair.sign(message);

        return {
            bytes,
            variant: this.keypair.variant,
            timestamp: Date.now(),
            messageHash: hashMessage(message),
        };
    }

    /**
     * Sign a message and return raw signature bytes
     * 
     * @param message - Message bytes to sign
     * @returns Raw signature bytes
     */
    signRaw(message: Uint8Array): Uint8Array {
        return this.keypair.sign(message);
    }

    /**
     * Verify a signature
     * 
     * @param message - Original message
     * @param signature - Signature bytes to verify
     * @returns true if valid
     */
    verify(message: Uint8Array, signature: Uint8Array): boolean {
        return this.keypair.verify(message, signature);
    }

    /**
     * Create a dual-signing function for hybrid Ed25519 + ML-DSA
     * 
     * This is useful for implementing the Quresis dual-signature pattern
     * where both classical (Ed25519) and quantum (ML-DSA) signatures are used.
     * 
     * @param ed25519Sign - Ed25519 signing function (from Solana wallet)
     * @returns Combined signing function
     */
    createDualSigner(
        ed25519Sign: (message: Uint8Array) => Promise<Uint8Array>
    ): (message: Uint8Array) => Promise<{ ed25519: Uint8Array; mlDsa: Uint8Array }> {
        return async (message: Uint8Array) => {
            const [ed25519Sig, mlDsaSig] = await Promise.all([
                ed25519Sign(message),
                this.sign(message).then(sig => sig.bytes),
            ]);

            return {
                ed25519: ed25519Sig,
                mlDsa: mlDsaSig,
            };
        };
    }

    /**
     * Create a message for key rotation authorization
     * 
     * @param newPublicKey - The new public key being rotated to
     * @param sequence - Current sequence number from identity
     * @returns Message bytes to sign
     */
    createRotationMessage(
        newPublicKey: Uint8Array,
        sequence: bigint
    ): Uint8Array {
        const prefix = new TextEncoder().encode('QURESIS_KEY_ROTATION_V1:');
        const seqBytes = new Uint8Array(8);
        new DataView(seqBytes.buffer).setBigUint64(0, sequence, true);

        const message = new Uint8Array(
            prefix.length + seqBytes.length + newPublicKey.length
        );
        message.set(prefix, 0);
        message.set(seqBytes, prefix.length);
        message.set(newPublicKey, prefix.length + seqBytes.length);

        return message;
    }

    /**
     * Create a message for transfer authorization
     * 
     * @param amount - Transfer amount in base units
     * @param destination - Destination public key bytes
     * @param sequence - Current sequence number
     * @returns Message bytes to sign
     */
    createTransferMessage(
        amount: bigint,
        destination: Uint8Array,
        sequence: bigint
    ): Uint8Array {
        const prefix = new TextEncoder().encode('QURESIS_TRANSFER_V1:');
        const amountBytes = new Uint8Array(8);
        new DataView(amountBytes.buffer).setBigUint64(0, amount, true);
        const seqBytes = new Uint8Array(8);
        new DataView(seqBytes.buffer).setBigUint64(0, sequence, true);

        const message = new Uint8Array(
            prefix.length + amountBytes.length + destination.length + seqBytes.length
        );
        message.set(prefix, 0);
        message.set(amountBytes, prefix.length);
        message.set(destination, prefix.length + amountBytes.length);
        message.set(seqBytes, prefix.length + amountBytes.length + destination.length);

        return message;
    }
}

/**
 * Static verifier for verifying signatures without a full keypair
 */
export class QuresisVerifier {
    /**
     * Verify a signature using only the public key
     * 
     * @param variant - ML-DSA variant
     * @param publicKey - Public key bytes
     * @param message - Original message
     * @param signature - Signature to verify
     * @returns true if valid
     */
    static verify(
        variant: MLDSAVariant,
        publicKey: Uint8Array,
        message: Uint8Array,
        signature: Uint8Array
    ): boolean {
        // Import dynamically to avoid loading unused variants
        const { ml_dsa44, ml_dsa65 } = require('@noble/post-quantum/ml-dsa');
        const mlDsa = variant === 'ML-DSA-44' ? ml_dsa44 : ml_dsa65;
        // noble/post-quantum v0.2.1 API: verify(publicKey, message, signature)
        return mlDsa.verify(publicKey, message, signature);
    }
}
