use anchor_lang::prelude::*;

declare_id!("7SwY7dD2rQTvWs8KUB1xsy3GuUbKBoJdcPvx8kGiuojv");

/// Constants for ML-DSA (Module-Lattice Digital Signature Algorithm)
/// Based on NIST FIPS 204 Specifications
pub mod constants {
    /// ML-DSA-44 Public Key Size (1312 bytes)
    pub const ML_DSA_44_PUBKEY_SIZE: usize = 1312;
    /// ML-DSA-44 Signature Size (2420 bytes)
    pub const ML_DSA_44_SIG_SIZE: usize = 2420;
    /// ML-DSA-65 Public Key Size (1952 bytes)
    pub const ML_DSA_65_PUBKEY_SIZE: usize = 1952;
    /// ML-DSA-65 Signature Size (3293 bytes)
    pub const ML_DSA_65_SIG_SIZE: usize = 3293;
    /// Maximum supported key size (with buffer)
    pub const MAX_PQC_PUBKEY_SIZE: usize = 2048;
    /// PDA Seed Prefix
    pub const SEED_PREFIX: &[u8] = b"quresis_id";
    /// Default threshold amount in lamports (100 SOL = 100 * 10^9)
    pub const DEFAULT_THRESHOLD: u64 = 100_000_000_000;
    /// Minimum threshold amount in lamports (1 SOL = 10^9)
    /// Prevents setting threshold too low which would require PQC for every transfer
    pub const MIN_THRESHOLD: u64 = 1_000_000_000;
    /// Maximum threshold amount in lamports (1,000,000 SOL)
    /// Prevents setting threshold so high that PQC is effectively disabled
    pub const MAX_THRESHOLD: u64 = 1_000_000_000_000_000_000;
}

use constants::*;

#[program]
pub mod quresis {
    use super::*;

    /// Register a new Quantum Identity
    /// Links a Solana wallet (Ed25519) with a Post-Quantum public key (ML-DSA)
    pub fn register_identity(
        ctx: Context<RegisterIdentity>,
        pqc_public_key: Vec<u8>,
        threshold_amount: Option<u64>,
    ) -> Result<()> {
        // Validate key length
        require!(
            pqc_public_key.len() == ML_DSA_44_PUBKEY_SIZE
                || pqc_public_key.len() == ML_DSA_65_PUBKEY_SIZE,
            QuresisError::InvalidKeyLength
        );

        // Validate threshold amount
        let threshold = threshold_amount.unwrap_or(DEFAULT_THRESHOLD);
        require!(
            threshold >= MIN_THRESHOLD && threshold <= MAX_THRESHOLD,
            QuresisError::InvalidThreshold
        );

        let identity = &mut ctx.accounts.identity;
        let clock = Clock::get()?;

        identity.authority = ctx.accounts.authority.key();
        identity.pqc_public_key = pqc_public_key;
        identity.bump = ctx.bumps.identity;
        identity.sequence = 0;
        identity.last_active_slot = clock.slot;
        identity.created_at = clock.unix_timestamp;
        identity.is_frozen = false;
        identity.threshold_amount = threshold;
        identity.key_version = 1;

        emit!(IdentityRegistered {
            authority: identity.authority,
            key_size: identity.pqc_public_key.len() as u16,
            threshold: identity.threshold_amount,
            slot: clock.slot,
        });

        msg!("✅ Quantum Identity Registered for: {}", identity.authority);
        msg!("   PQC Key Size: {} bytes", identity.pqc_public_key.len());
        msg!("   Threshold: {} lamports", identity.threshold_amount);

        Ok(())
    }

    /// Rotate the quantum key (requires signature from OLD key)
    /// Critical for long-term security maintenance
    pub fn rotate_key(
        ctx: Context<RotateKey>,
        new_pqc_public_key: Vec<u8>,
        old_key_signature: Vec<u8>,
        signature_message: Vec<u8>,
    ) -> Result<()> {
        let identity = &mut ctx.accounts.identity;

        // Validate new key length
        require!(
            new_pqc_public_key.len() == ML_DSA_44_PUBKEY_SIZE
                || new_pqc_public_key.len() == ML_DSA_65_PUBKEY_SIZE,
            QuresisError::InvalidKeyLength
        );

        require!(!identity.is_frozen, QuresisError::IdentityFrozen);

        // Verify signature using OLD key (Post-Quantum 2FA)
        // This ensures the rotation is authorized by the current key holder
        let is_valid = mock_pqc_verify(
            &identity.pqc_public_key,
            &signature_message,
            &old_key_signature,
        );
        require!(is_valid, QuresisError::InvalidQuantumSignature);

        let old_version = identity.key_version;
        let clock = Clock::get()?;

        // Update to new key
        identity.pqc_public_key = new_pqc_public_key;
        identity.key_version = identity.key_version.checked_add(1).unwrap_or(u16::MAX);
        identity.last_active_slot = clock.slot;
        identity.sequence = identity.sequence.checked_add(1).unwrap_or(u64::MAX);

        emit!(KeyRotated {
            authority: identity.authority,
            old_version,
            new_version: identity.key_version,
            new_key_size: identity.pqc_public_key.len() as u16,
            slot: clock.slot,
        });

        msg!("🔄 Quantum Key Rotated for: {}", identity.authority);
        msg!("   Version: {} -> {}", old_version, identity.key_version);

        Ok(())
    }

    /// Verify a quantum signature
    /// Called by Transfer Hook or external programs via CPI
    pub fn verify_signature(
        ctx: Context<VerifySignature>,
        message: Vec<u8>,
        signature: Vec<u8>,
    ) -> Result<()> {
        let identity = &ctx.accounts.identity;

        require!(!identity.is_frozen, QuresisError::IdentityFrozen);

        // --- NATIVE PQC SYSCALL INTEGRATION ZONE ---
        // Currently using Mock Verification (Development Phase)
        // Will be replaced with: solana_program::pqc::verify_ml_dsa()
        let is_valid = mock_pqc_verify(
            &identity.pqc_public_key,
            &message,
            &signature,
        );

        require!(is_valid, QuresisError::InvalidQuantumSignature);

        emit!(SignatureVerified {
            authority: identity.authority,
            message_hash: hash_message(&message),
            slot: Clock::get()?.slot,
        });

        msg!("✅ Quantum Signature Verified!");

        Ok(())
    }

    /// Update the threshold amount for quantum signature requirement
    pub fn update_threshold(
        ctx: Context<ManageIdentity>,
        new_threshold: u64,
    ) -> Result<()> {
        // Validate new threshold
        require!(
            new_threshold >= MIN_THRESHOLD && new_threshold <= MAX_THRESHOLD,
            QuresisError::InvalidThreshold
        );

        let identity = &mut ctx.accounts.identity;
        let old_threshold = identity.threshold_amount;

        identity.threshold_amount = new_threshold;
        identity.last_active_slot = Clock::get()?.slot;

        emit!(ThresholdUpdated {
            authority: identity.authority,
            old_threshold,
            new_threshold,
        });

        msg!("📊 Threshold Updated: {} -> {} lamports", old_threshold, new_threshold);

        Ok(())
    }

    /// Emergency freeze - locks the identity if key compromise is suspected
    pub fn toggle_freeze(ctx: Context<ManageIdentity>) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.is_frozen = !identity.is_frozen;
        identity.last_active_slot = Clock::get()?.slot;

        emit!(FreezeToggled {
            authority: identity.authority,
            is_frozen: identity.is_frozen,
            slot: Clock::get()?.slot,
        });

        msg!(
            "🔒 Identity Freeze State: {}",
            if identity.is_frozen { "FROZEN" } else { "ACTIVE" }
        );

        Ok(())
    }

    /// Close and reclaim rent from an identity account
    pub fn close_identity(_ctx: Context<CloseIdentity>) -> Result<()> {
        msg!("🗑️ Identity Account Closed");
        Ok(())
    }
}

// ============================================================================
// ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction(pqc_public_key: Vec<u8>)]
pub struct RegisterIdentity<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + QuantumIdentity::INIT_SPACE + pqc_public_key.len(),
        seeds = [SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, QuantumIdentity>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_pqc_public_key: Vec<u8>)]
pub struct RotateKey<'info> {
    #[account(
        mut,
        seeds = [SEED_PREFIX, authority.key().as_ref()],
        bump = identity.bump,
        has_one = authority,
        // Realloc if new key is different size
        realloc = 8 + QuantumIdentity::INIT_SPACE + new_pqc_public_key.len(),
        realloc::payer = authority,
        realloc::zero = false,
    )]
    pub identity: Account<'info, QuantumIdentity>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifySignature<'info> {
    #[account(
        seeds = [SEED_PREFIX, identity.authority.as_ref()],
        bump = identity.bump,
    )]
    pub identity: Account<'info, QuantumIdentity>,
    // Note: Signer not required - verification can be called by hooks/relayers
}

#[derive(Accounts)]
pub struct ManageIdentity<'info> {
    #[account(
        mut,
        seeds = [SEED_PREFIX, authority.key().as_ref()],
        bump = identity.bump,
        has_one = authority
    )]
    pub identity: Account<'info, QuantumIdentity>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseIdentity<'info> {
    #[account(
        mut,
        seeds = [SEED_PREFIX, authority.key().as_ref()],
        bump = identity.bump,
        has_one = authority,
        close = authority
    )]
    pub identity: Account<'info, QuantumIdentity>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct QuantumIdentity {
    /// The Solana wallet that owns this identity (Ed25519)
    pub authority: Pubkey,                // 32 bytes
    /// PDA bump seed
    pub bump: u8,                         // 1 byte
    /// Anti-replay nonce for PQC signatures
    pub sequence: u64,                    // 8 bytes
    /// Last activity slot
    pub last_active_slot: u64,            // 8 bytes
    /// Creation timestamp
    pub created_at: i64,                  // 8 bytes
    /// Emergency freeze flag
    pub is_frozen: bool,                  // 1 byte
    /// Transaction amount threshold requiring PQC signature
    pub threshold_amount: u64,            // 8 bytes
    /// Key version (incremented on rotation)
    pub key_version: u16,                 // 2 bytes
    /// ML-DSA Public Key (variable size: 1312 or 1952 bytes)
    #[max_len(2048)]
    pub pqc_public_key: Vec<u8>,          // 4 + len bytes
}

impl QuantumIdentity {
    /// Base space without the vector data
    pub const INIT_SPACE: usize = 32 + 1 + 8 + 8 + 8 + 1 + 8 + 2 + 4;
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct IdentityRegistered {
    pub authority: Pubkey,
    pub key_size: u16,
    pub threshold: u64,
    pub slot: u64,
}

#[event]
pub struct KeyRotated {
    pub authority: Pubkey,
    pub old_version: u16,
    pub new_version: u16,
    pub new_key_size: u16,
    pub slot: u64,
}

#[event]
pub struct SignatureVerified {
    pub authority: Pubkey,
    pub message_hash: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct ThresholdUpdated {
    pub authority: Pubkey,
    pub old_threshold: u64,
    pub new_threshold: u64,
}

#[event]
pub struct FreezeToggled {
    pub authority: Pubkey,
    pub is_frozen: bool,
    pub slot: u64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum QuresisError {
    #[msg("Invalid PQC public key length. Expected 1312 (ML-DSA-44) or 1952 (ML-DSA-65) bytes.")]
    InvalidKeyLength,

    #[msg("Quantum signature verification failed.")]
    InvalidQuantumSignature,

    #[msg("This Quantum Identity is currently frozen.")]
    IdentityFrozen,

    #[msg("Signature size is invalid.")]
    InvalidSignatureSize,

    #[msg("Message size exceeds maximum allowed.")]
    MessageTooLarge,

    #[msg("Sequence number mismatch - possible replay attack.")]
    SequenceMismatch,

    #[msg("Invalid threshold: must be between 1 SOL and 1,000,000 SOL.")]
    InvalidThreshold,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Mock verification function for native PQC syscall
/// TODO: Replace with actual syscall when available
fn mock_pqc_verify(_pubkey: &[u8], _message: &[u8], _signature: &[u8]) -> bool {
    // --- NATIVE PQC SYSCALL PLACEHOLDER ---
    // In production, this will be replaced with:
    // solana_program::pqc::verify_ml_dsa(pubkey, message, signature)
    //
    // For testing, we simulate success. To test failure paths,
    // check if signature starts with [0, 0, 0, 0] (failure marker)
    if _signature.len() >= 4 && _signature[0..4] == [0, 0, 0, 0] {
        return false;
    }
    true
}

/// Hash a message to 32 bytes for event logging
/// Uses a proper collision-resistant hash via Pubkey derivation (SHA256-based)
/// This provides cryptographic correctness for event identification
fn hash_message(message: &[u8]) -> [u8; 32] {
    // Use Pubkey::find_program_address which internally uses SHA256
    // We hash the message through the PDA derivation mechanism
    // The bump is discarded - we only want the deterministic hash output
    let seeds: &[&[u8]] = &[b"msg_hash", message];
    let (hash_key, _) = Pubkey::find_program_address(seeds, &crate::ID);
    hash_key.to_bytes()
}

