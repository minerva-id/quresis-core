import { ml_dsa44, ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { randomBytes } from '@noble/post-quantum/utils';
import type { MLDSAVariant } from './types';
import { ML_DSA_CONSTANTS } from './constants';
import { bufferToHex, hexToBuffer } from './utils';

/**
 * Options for generating or importing a keypair
 */
export interface KeyPairOptions {
    /** ML-DSA variant to use */
    variant?: MLDSAVariant;
    /** Optional seed for deterministic key generation */
    seed?: Uint8Array;
}

/**
 * Serialized keypair for storage/transmission
 */
export interface SerializedKeyPair {
    /** ML-DSA variant */
    variant: MLDSAVariant;
    /** Public key as hex string */
    publicKeyHex: string;
    /** Secret key as hex string (handle with care!) */
    secretKeyHex: string;
    /** Creation timestamp */
    createdAt: number;
    /** Optional label */
    label?: string;
}

/**
 * QuresisKeyPair - ML-DSA Keypair for Post-Quantum Signatures
 * 
 * Provides generation, serialization, and management of ML-DSA keypairs
 * compatible with Quresis Protocol on Solana.
 * 
 * @example
 * ```typescript
 * // Generate a new keypair
 * const keypair = QuresisKeyPair.generate('ML-DSA-44');
 * 
 * // Get public key for on-chain registration
 * const publicKey = keypair.publicKey;
 * console.log(`Public key size: ${publicKey.length} bytes`);
 * 
 * // Sign a message
 * const signature = keypair.sign(message);
 * 
 * // Verify a signature
 * const isValid = keypair.verify(message, signature);
 * 
 * // Serialize for storage
 * const serialized = keypair.serialize('my-identity');
 * 
 * // Restore from serialized
 * const restored = QuresisKeyPair.fromSerialized(serialized);
 * ```
 */
export class QuresisKeyPair {
    /** ML-DSA variant */
    readonly variant: MLDSAVariant;
    /** Public key bytes */
    readonly publicKey: Uint8Array;
    /** Secret key bytes */
    readonly secretKey: Uint8Array;
    /** Creation timestamp */
    readonly createdAt: number;

    private constructor(
        variant: MLDSAVariant,
        publicKey: Uint8Array,
        secretKey: Uint8Array,
        createdAt: number = Date.now()
    ) {
        this.variant = variant;
        this.publicKey = publicKey;
        this.secretKey = secretKey;
        this.createdAt = createdAt;

        // Validate key sizes
        const constants = ML_DSA_CONSTANTS[variant];
        if (publicKey.length !== constants.publicKeySize) {
            throw new Error(
                `Invalid public key size for ${variant}: expected ${constants.publicKeySize}, got ${publicKey.length}`
            );
        }
        if (secretKey.length !== constants.secretKeySize) {
            throw new Error(
                `Invalid secret key size for ${variant}: expected ${constants.secretKeySize}, got ${secretKey.length}`
            );
        }
    }

    /**
     * Generate a new ML-DSA keypair
     * 
     * @param variant - ML-DSA variant (default: ML-DSA-44)
     * @param options - Additional generation options
     * @returns A new QuresisKeyPair
     */
    static generate(
        variant: MLDSAVariant = 'ML-DSA-44',
        options?: KeyPairOptions
    ): QuresisKeyPair {
        const mlDsa = variant === 'ML-DSA-44' ? ml_dsa44 : ml_dsa65;

        // ML-DSA keygen requires a 32-byte seed
        const seed = options?.seed ?? randomBytes(32);
        const keys = mlDsa.keygen(seed);

        return new QuresisKeyPair(
            variant,
            keys.publicKey,
            keys.secretKey
        );
    }

    /**
     * Create a keypair from existing keys
     * 
     * @param variant - ML-DSA variant
     * @param publicKey - Public key bytes
     * @param secretKey - Secret key bytes
     * @returns A QuresisKeyPair
     */
    static fromKeys(
        variant: MLDSAVariant,
        publicKey: Uint8Array,
        secretKey: Uint8Array
    ): QuresisKeyPair {
        return new QuresisKeyPair(variant, publicKey, secretKey);
    }

    /**
     * Restore a keypair from serialized format
     * 
     * @param serialized - Serialized keypair object
     * @returns A QuresisKeyPair
     */
    static fromSerialized(serialized: SerializedKeyPair): QuresisKeyPair {
        return new QuresisKeyPair(
            serialized.variant,
            hexToBuffer(serialized.publicKeyHex),
            hexToBuffer(serialized.secretKeyHex),
            serialized.createdAt
        );
    }

    /**
     * Sign a message with this keypair
     * 
     * @param message - Message bytes to sign
     * @returns Signature bytes
     */
    sign(message: Uint8Array): Uint8Array {
        const mlDsa = this.variant === 'ML-DSA-44' ? ml_dsa44 : ml_dsa65;
        // noble/post-quantum v0.2.1 API: sign(secretKey, message)
        return mlDsa.sign(this.secretKey, message);
    }

    /**
     * Verify a signature against this keypair's public key
     * 
     * @param message - Original message bytes
     * @param signature - Signature to verify
     * @returns true if signature is valid
     */
    verify(message: Uint8Array, signature: Uint8Array): boolean {
        const mlDsa = this.variant === 'ML-DSA-44' ? ml_dsa44 : ml_dsa65;
        // noble/post-quantum v0.2.1 API: verify(publicKey, message, signature)
        return mlDsa.verify(this.publicKey, message, signature);
    }

    /**
     * Get the expected signature size for this variant
     */
    get signatureSize(): number {
        return ML_DSA_CONSTANTS[this.variant].signatureSize;
    }

    /**
     * Get the security level (2 or 3)
     */
    get securityLevel(): number {
        return ML_DSA_CONSTANTS[this.variant].securityLevel;
    }

    /**
     * Serialize the keypair for storage
     * 
     * ⚠️ WARNING: This includes the secret key. Handle with extreme care!
     * 
     * @param label - Optional label for identification
     * @returns Serialized keypair
     */
    serialize(label?: string): SerializedKeyPair {
        return {
            variant: this.variant,
            publicKeyHex: bufferToHex(this.publicKey),
            secretKeyHex: bufferToHex(this.secretKey),
            createdAt: this.createdAt,
            label,
        };
    }

    /**
     * Get the public key as hex string
     */
    get publicKeyHex(): string {
        return bufferToHex(this.publicKey);
    }

    /**
     * Check if two keypairs have the same public key
     */
    equals(other: QuresisKeyPair): boolean {
        if (this.variant !== other.variant) return false;
        if (this.publicKey.length !== other.publicKey.length) return false;

        for (let i = 0; i < this.publicKey.length; i++) {
            if (this.publicKey[i] !== other.publicKey[i]) return false;
        }
        return true;
    }

    /**
     * Get a string representation (safe - no secret key)
     */
    toString(): string {
        return `QuresisKeyPair(${this.variant}, ${this.publicKeyHex.slice(0, 32)}...)`;
    }
}
