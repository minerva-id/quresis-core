import { PublicKey } from '@solana/web3.js';

/**
 * Supported ML-DSA variants
 * - ML-DSA-44: NIST Security Level 2 (1312 byte public key, 2420 byte signature)
 * - ML-DSA-65: NIST Security Level 3 (1952 byte public key, 3293 byte signature)
 */
export type MLDSAVariant = 'ML-DSA-44' | 'ML-DSA-65';

/**
 * Quantum Identity stored on-chain
 */
export interface QuantumIdentity {
    /** The Solana wallet that owns this identity */
    authority: PublicKey;
    /** PDA bump seed */
    bump: number;
    /** Anti-replay nonce */
    sequence: bigint;
    /** Last activity slot */
    lastActiveSlot: bigint;
    /** Creation timestamp */
    createdAt: bigint;
    /** Emergency freeze flag */
    isFrozen: boolean;
    /** Threshold amount requiring PQC signature */
    thresholdAmount: bigint;
    /** Key version (incremented on rotation) */
    keyVersion: number;
    /** ML-DSA public key bytes */
    pqcPublicKey: Uint8Array;
}

/**
 * Enforcement mode for transfer hooks
 */
export enum EnforcementMode {
    /** Hook is disabled */
    Disabled = 0,
    /** Soft enforcement - logs but allows */
    SoftEnforce = 1,
    /** Hard enforcement - blocks without PQC signature */
    HardEnforce = 2,
}

/**
 * Hook configuration stored on-chain
 */
export interface HookConfig {
    /** The mint this hook is attached to */
    mint: PublicKey;
    /** The authority who can update settings */
    authority: PublicKey;
    /** Current enforcement mode */
    enforcementMode: EnforcementMode;
    /** Total transfers checked */
    totalTransfersChecked: bigint;
    /** High value transfers detected */
    highValueTransfersDetected: bigint;
    /** PDA bump */
    bump: number;
}

/**
 * Signature result from ML-DSA signing
 */
export interface QuantumSignature {
    /** Raw signature bytes */
    bytes: Uint8Array;
    /** Signature variant used */
    variant: MLDSAVariant;
    /** Timestamp of signing */
    timestamp: number;
    /** Message hash (for verification) */
    messageHash: Uint8Array;
}

/**
 * Event emitted when a high-value transfer is detected
 */
export interface HighValueTransferEvent {
    mint: PublicKey;
    sender: PublicKey;
    amount: bigint;
    threshold: bigint;
    identityPda: PublicKey;
    enforcementMode: EnforcementMode;
}
