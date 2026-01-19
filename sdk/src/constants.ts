import { PublicKey } from '@solana/web3.js';

/**
 * Program IDs for Quresis Protocol on different networks
 */
export const PROGRAM_IDS = {
    /** Quresis Core program - manages Quantum Identities */
    quresis: {
        devnet: new PublicKey('7SwY7dD2rQTvWs8KUB1xsy3GuUbKBoJdcPvx8kGiuojv'),
        mainnet: new PublicKey('7SwY7dD2rQTvWs8KUB1xsy3GuUbKBoJdcPvx8kGiuojv'), // TODO: Update after mainnet deploy
    },
    /** Quresis Hook program - enforces PQC on transfers */
    quresisHook: {
        devnet: new PublicKey('9P6cDkGwt3AADtVtFLy3nCHz3ZDLnMLpscUmVFqosvB4'),
        mainnet: new PublicKey('9P6cDkGwt3AADtVtFLy3nCHz3ZDLnMLpscUmVFqosvB4'), // TODO: Update after mainnet deploy
    },
} as const;

/**
 * ML-DSA algorithm constants based on NIST FIPS 204
 */
export const ML_DSA_CONSTANTS = {
    /** ML-DSA-44 (Security Level 2) */
    'ML-DSA-44': {
        publicKeySize: 1312,
        secretKeySize: 2560,
        signatureSize: 2420,
        securityLevel: 2,
    },
    /** ML-DSA-65 (Security Level 3) */
    'ML-DSA-65': {
        publicKeySize: 1952,
        secretKeySize: 4032,
        signatureSize: 3293,
        securityLevel: 3,
    },
} as const;

/**
 * PDA seed prefixes used by Quresis programs
 */
export const SEED_PREFIXES = {
    /** Quantum Identity PDA seed */
    identity: Buffer.from('quresis_id'),
    /** Hook Config PDA seed */
    hookConfig: Buffer.from('quresis_hook'),
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
    /** Default threshold in lamports (100 SOL) */
    threshold: BigInt(100_000_000_000),
    /** Default ML-DSA variant */
    variant: 'ML-DSA-44' as const,
} as const;
