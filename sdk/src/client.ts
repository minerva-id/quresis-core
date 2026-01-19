import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import { PROGRAM_IDS, DEFAULTS } from './constants';
import { deriveIdentityPda, deriveHookConfigPda } from './utils';
import type { QuantumIdentity, HookConfig, EnforcementMode } from './types';

/**
 * Configuration for QuresisClient
 */
export interface QuresisClientConfig {
    /** Solana connection */
    connection: Connection;
    /** Payer/authority wallet */
    wallet: {
        publicKey: PublicKey;
        signTransaction: (tx: Transaction) => Promise<Transaction>;
        signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
    };
    /** Network (for program ID selection) */
    network?: 'devnet' | 'mainnet';
    /** Custom program IDs (optional) */
    programIds?: {
        quresis?: PublicKey;
        quresisHook?: PublicKey;
    };
}

/**
 * QuresisClient - On-chain interaction client
 * 
 * Provides methods to interact with Quresis programs on Solana.
 * 
 * @example
 * ```typescript
 * const client = new QuresisClient({
 *   connection,
 *   wallet,
 *   network: 'devnet',
 * });
 * 
 * // Check if wallet has a Quantum Identity
 * const identity = await client.getIdentity(wallet.publicKey);
 * 
 * // Register a new identity
 * await client.registerIdentity(pqcPublicKey);
 * ```
 */
export class QuresisClient {
    readonly connection: Connection;
    readonly wallet: QuresisClientConfig['wallet'];
    readonly quresisProgram: PublicKey;
    readonly quresisHookProgram: PublicKey;

    constructor(config: QuresisClientConfig) {
        this.connection = config.connection;
        this.wallet = config.wallet;

        const network = config.network ?? 'devnet';
        this.quresisProgram = config.programIds?.quresis ?? PROGRAM_IDS.quresis[network];
        this.quresisHookProgram = config.programIds?.quresisHook ?? PROGRAM_IDS.quresisHook[network];
    }

    // ==========================================================================
    // Identity Management
    // ==========================================================================

    /**
     * Get the identity PDA for an authority
     */
    getIdentityPda(authority: PublicKey): { pda: PublicKey; bump: number } {
        return deriveIdentityPda(authority, this.quresisProgram);
    }

    /**
     * Fetch a Quantum Identity account
     * 
     * @param authority - The wallet public key
     * @returns QuantumIdentity or null if not registered
     */
    async getIdentity(authority: PublicKey): Promise<QuantumIdentity | null> {
        const { pda } = this.getIdentityPda(authority);
        const account = await this.connection.getAccountInfo(pda);

        if (!account || account.data.length === 0) {
            return null;
        }

        return this.parseQuantumIdentity(account.data);
    }

    /**
     * Check if a wallet has a registered Quantum Identity
     */
    async hasIdentity(authority: PublicKey): Promise<boolean> {
        const identity = await this.getIdentity(authority);
        return identity !== null;
    }

    /**
     * Build a register identity instruction
     * 
     * @param pqcPublicKey - ML-DSA public key bytes
     * @param threshold - Optional threshold in lamports
     * @returns Transaction instruction
     */
    buildRegisterIdentityInstruction(
        pqcPublicKey: Uint8Array,
        threshold: bigint = DEFAULTS.threshold
    ): TransactionInstruction {
        const { pda } = this.getIdentityPda(this.wallet.publicKey);

        // Anchor instruction discriminator for "register_identity"
        const discriminator = Buffer.from([175, 176, 141, 171, 210, 183, 107, 119]);

        // Serialize arguments
        const thresholdBuffer = Buffer.alloc(9);
        thresholdBuffer.writeUInt8(1, 0); // Some variant
        thresholdBuffer.writeBigUInt64LE(threshold, 1);

        const keyLenBuffer = Buffer.alloc(4);
        keyLenBuffer.writeUInt32LE(pqcPublicKey.length, 0);

        const data = Buffer.concat([
            discriminator,
            keyLenBuffer,
            Buffer.from(pqcPublicKey),
            thresholdBuffer,
        ]);

        return new TransactionInstruction({
            programId: this.quresisProgram,
            keys: [
                { pubkey: pda, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data,
        });
    }

    /**
     * Register a Quantum Identity for the connected wallet
     * 
     * @param pqcPublicKey - ML-DSA public key bytes
     * @param threshold - Optional threshold in lamports (default: 100 SOL)
     * @returns Transaction signature
     */
    async registerIdentity(
        pqcPublicKey: Uint8Array,
        threshold?: bigint
    ): Promise<string> {
        const ix = this.buildRegisterIdentityInstruction(pqcPublicKey, threshold);

        const tx = new Transaction().add(ix);
        tx.feePayer = this.wallet.publicKey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

        const signed = await this.wallet.signTransaction(tx);
        const signature = await this.connection.sendRawTransaction(signed.serialize());

        await this.connection.confirmTransaction(signature);
        return signature;
    }

    /**
     * Update the threshold for quantum signature requirement
     * 
     * @param newThreshold - New threshold in lamports
     * @returns Transaction signature
     */
    async updateThreshold(newThreshold: bigint): Promise<string> {
        const { pda } = this.getIdentityPda(this.wallet.publicKey);

        // Anchor instruction discriminator for "update_threshold"
        const discriminator = Buffer.from([79, 112, 115, 87, 182, 145, 92, 78]);

        const thresholdBuffer = Buffer.alloc(8);
        thresholdBuffer.writeBigUInt64LE(newThreshold, 0);

        const data = Buffer.concat([discriminator, thresholdBuffer]);

        const ix = new TransactionInstruction({
            programId: this.quresisProgram,
            keys: [
                { pubkey: pda, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
            ],
            data,
        });

        const tx = new Transaction().add(ix);
        tx.feePayer = this.wallet.publicKey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

        const signed = await this.wallet.signTransaction(tx);
        const signature = await this.connection.sendRawTransaction(signed.serialize());

        await this.connection.confirmTransaction(signature);
        return signature;
    }

    /**
     * Toggle freeze state of the identity
     * 
     * @returns Transaction signature
     */
    async toggleFreeze(): Promise<string> {
        const { pda } = this.getIdentityPda(this.wallet.publicKey);

        // Anchor instruction discriminator for "toggle_freeze"
        const discriminator = Buffer.from([126, 245, 172, 144, 148, 158, 144, 54]);

        const ix = new TransactionInstruction({
            programId: this.quresisProgram,
            keys: [
                { pubkey: pda, isSigner: false, isWritable: true },
                { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
            ],
            data: discriminator,
        });

        const tx = new Transaction().add(ix);
        tx.feePayer = this.wallet.publicKey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

        const signed = await this.wallet.signTransaction(tx);
        const signature = await this.connection.sendRawTransaction(signed.serialize());

        await this.connection.confirmTransaction(signature);
        return signature;
    }

    // ==========================================================================
    // Hook Management
    // ==========================================================================

    /**
     * Get the hook config PDA for a mint
     */
    getHookConfigPda(mint: PublicKey): { pda: PublicKey; bump: number } {
        return deriveHookConfigPda(mint, this.quresisHookProgram);
    }

    /**
     * Fetch a Hook Config account
     */
    async getHookConfig(mint: PublicKey): Promise<HookConfig | null> {
        const { pda } = this.getHookConfigPda(mint);
        const account = await this.connection.getAccountInfo(pda);

        if (!account || account.data.length === 0) {
            return null;
        }

        return this.parseHookConfig(account.data);
    }

    // ==========================================================================
    // Parsers
    // ==========================================================================

    private parseQuantumIdentity(data: Buffer): QuantumIdentity {
        // Skip 8-byte discriminator
        let offset = 8;

        const authority = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const bump = data[offset];
        offset += 1;

        const sequence = data.readBigUInt64LE(offset);
        offset += 8;

        const lastActiveSlot = data.readBigUInt64LE(offset);
        offset += 8;

        const createdAt = data.readBigInt64LE(offset);
        offset += 8;

        const isFrozen = data[offset] === 1;
        offset += 1;

        const thresholdAmount = data.readBigUInt64LE(offset);
        offset += 8;

        const keyVersion = data.readUInt16LE(offset);
        offset += 2;

        const keyLen = data.readUInt32LE(offset);
        offset += 4;

        const pqcPublicKey = new Uint8Array(data.subarray(offset, offset + keyLen));

        return {
            authority,
            bump,
            sequence,
            lastActiveSlot,
            createdAt,
            isFrozen,
            thresholdAmount,
            keyVersion,
            pqcPublicKey,
        };
    }

    private parseHookConfig(data: Buffer): HookConfig {
        // Skip 8-byte discriminator
        let offset = 8;

        const mint = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const authority = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const enforcementMode = data[offset] as EnforcementMode;
        offset += 1;

        const totalTransfersChecked = data.readBigUInt64LE(offset);
        offset += 8;

        const highValueTransfersDetected = data.readBigUInt64LE(offset);
        offset += 8;

        const bump = data[offset];

        return {
            mint,
            authority,
            enforcementMode,
            totalTransfersChecked,
            highValueTransfersDetected,
            bump,
        };
    }
}
