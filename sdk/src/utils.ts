import { PublicKey } from '@solana/web3.js';
import { SEED_PREFIXES, PROGRAM_IDS } from './constants';

/**
 * Derive the Quantum Identity PDA for a given authority
 * 
 * @param authority - The Solana wallet public key
 * @param programId - Optional custom program ID (defaults to devnet)
 * @returns The PDA public key and bump
 * 
 * @example
 * ```typescript
 * const { pda, bump } = deriveIdentityPda(walletPubkey);
 * ```
 */
export function deriveIdentityPda(
    authority: PublicKey,
    programId: PublicKey = PROGRAM_IDS.quresis.devnet
): { pda: PublicKey; bump: number } {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [SEED_PREFIXES.identity, authority.toBuffer()],
        programId
    );
    return { pda, bump };
}

/**
 * Derive the Hook Config PDA for a given mint
 * 
 * @param mint - The token mint public key
 * @param programId - Optional custom program ID (defaults to devnet)
 * @returns The PDA public key and bump
 */
export function deriveHookConfigPda(
    mint: PublicKey,
    programId: PublicKey = PROGRAM_IDS.quresisHook.devnet
): { pda: PublicKey; bump: number } {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [SEED_PREFIXES.hookConfig, mint.toBuffer()],
        programId
    );
    return { pda, bump };
}

/**
 * Convert a Uint8Array to hex string
 */
export function bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Convert a hex string to Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
}

/**
 * Compute a collision-resistant hash of a message for logging
 * Uses PDA derivation (SHA256-based) to match the on-chain implementation
 * 
 * @param message - Message bytes to hash
 * @param programId - Optional program ID (defaults to Quresis devnet)
 * @returns 32-byte hash as Uint8Array
 */
export function hashMessage(
    message: Uint8Array,
    programId: PublicKey = PROGRAM_IDS.quresis.devnet
): Uint8Array {
    // Use the same approach as the on-chain program:
    // Hash through PDA derivation which uses SHA256 internally
    const [hashKey] = PublicKey.findProgramAddressSync(
        [Buffer.from('msg_hash'), message],
        programId
    );
    return hashKey.toBytes();
}

/**
 * Format lamports to SOL with decimals
 */
export function lamportsToSol(lamports: bigint): string {
    const sol = Number(lamports) / 1e9;
    return sol.toFixed(9).replace(/\.?0+$/, '');
}

/**
 * Parse SOL to lamports
 */
export function solToLamports(sol: number): bigint {
    return BigInt(Math.floor(sol * 1e9));
}
