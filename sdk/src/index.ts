/**
 * Quresis SDK
 * 
 * Post-Quantum Cryptography SDK for Solana RWAs
 * 
 * @example
 * ```typescript
 * import { QuresisKeyPair, QuresisSigner, QuresisClient } from '@quresis/sdk';
 * 
 * // Generate a new ML-DSA keypair
 * const keypair = QuresisKeyPair.generate('ML-DSA-44');
 * 
 * // Sign a message
 * const signer = new QuresisSigner(keypair);
 * const signature = await signer.sign(message);
 * 
 * // Interact with Quresis on-chain
 * const client = new QuresisClient(connection, wallet);
 * await client.registerIdentity(keypair.publicKey);
 * ```
 * 
 * @packageDocumentation
 */

// Core exports
export { QuresisKeyPair } from './keypair';
export type { KeyPairOptions, SerializedKeyPair } from './keypair';
export { QuresisSigner } from './signer';
export { QuresisClient } from './client';
export type { QuresisClientConfig } from './client';

// Types
export type {
    MLDSAVariant,
    QuantumIdentity,
    HookConfig,
} from './types';
export { EnforcementMode } from './types';

// Constants
export {
    PROGRAM_IDS,
    ML_DSA_CONSTANTS,
    SEED_PREFIXES,
} from './constants';

// Utilities
export {
    deriveIdentityPda,
    deriveHookConfigPda,
    bufferToHex,
    hexToBuffer,
} from './utils';
