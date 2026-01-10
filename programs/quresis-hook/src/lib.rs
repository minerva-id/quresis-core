use anchor_lang::prelude::*;

// Placeholder program ID - will be updated after first build
declare_id!("9P6cDkGwt3AADtVtFLy3nCHz3ZDLnMLpscUmVFqosvB4");

/// Transfer Hook Program for Quresis Protocol
/// 
/// This program implements a simplified Transfer Hook interface to enforce
/// post-quantum signature verification on high-value token transfers.
/// 
/// Architecture:
/// 1. SPL-2022 Token with Transfer Hook extension points to this program
/// 2. On transfer, this hook is called via CPI
/// 3. Hook checks sender's Quantum Identity threshold
/// 4. If amount >= threshold, quantum signature verification is required
/// 5. For MVP: Soft enforcement (logging) - Full enforcement in production
/// 
/// Note: Due to anchor-spl dependency issues with edition2024,
/// this implementation uses anchor-lang primitives directly.
#[program]
pub mod quresis_hook {
    use super::*;

    /// Initialize the hook configuration for a mint
    /// This creates the necessary PDA to store hook settings
    pub fn initialize_hook(
        ctx: Context<InitializeHook>,
        enforcement_mode: EnforcementMode,
    ) -> Result<()> {
        let hook_config = &mut ctx.accounts.hook_config;
        
        hook_config.mint = ctx.accounts.mint.key();
        hook_config.authority = ctx.accounts.authority.key();
        hook_config.enforcement_mode = enforcement_mode;
        hook_config.total_transfers_checked = 0;
        hook_config.high_value_transfers_detected = 0;
        hook_config.bump = ctx.bumps.hook_config;

        msg!("✅ Quresis Hook initialized for mint: {}", hook_config.mint);
        msg!("   Enforcement Mode: {:?}", enforcement_mode);

        Ok(())
    }

    /// The main transfer hook execution
    /// Called by SPL-2022 on every token transfer (simulated for MVP)
    /// 
    /// In production, this would be triggered automatically by SPL-2022.
    /// For MVP, we expose it as a manual instruction to demonstrate the logic.
    pub fn execute_transfer_check(
        ctx: Context<ExecuteTransferCheck>,
        amount: u64,
    ) -> Result<()> {
        let hook_config = &mut ctx.accounts.hook_config;
        let sender_identity = &ctx.accounts.sender_identity;

        msg!("🛡️ Quresis Quantum Guard - Transfer Check Triggered");
        msg!("   Mint: {}", hook_config.mint);
        msg!("   Amount: {} tokens", amount);

        // Increment counter
        hook_config.total_transfers_checked = hook_config
            .total_transfers_checked
            .checked_add(1)
            .unwrap_or(u64::MAX);

        // Check if sender has a registered Quantum Identity
        if sender_identity.data_is_empty() {
            msg!("   Status: No Quantum Identity - Transfer ALLOWED (opt-in)");
            return Ok(());
        }

        // Parse the Quantum Identity data
        let identity_data = sender_identity.try_borrow_data()?;
        
        // Validate minimum data length
        // Layout: discriminator(8) + authority(32) + bump(1) + sequence(8) + 
        //         last_active_slot(8) + created_at(8) + is_frozen(1) + threshold_amount(8) + key_version(2)
        const MIN_IDENTITY_SIZE: usize = 8 + 32 + 1 + 8 + 8 + 8 + 1 + 8 + 2;
        if identity_data.len() < MIN_IDENTITY_SIZE {
            msg!("   Warning: Invalid identity data length - Transfer ALLOWED");
            return Ok(());
        }

        // Check if identity is frozen (offset 65)
        let is_frozen = identity_data[65] == 1;
        if is_frozen {
            msg!("❌ REJECTED: Quantum Identity is FROZEN");
            return Err(QuresisHookError::IdentityFrozen.into());
        }

        // Read threshold amount (little-endian u64 at offset 66)
        let threshold_bytes: [u8; 8] = identity_data[66..74].try_into().unwrap();
        let threshold = u64::from_le_bytes(threshold_bytes);

        msg!("   Sender Threshold: {} tokens", threshold);

        // Check if this is a high-value transfer
        if amount >= threshold {
            hook_config.high_value_transfers_detected = hook_config
                .high_value_transfers_detected
                .checked_add(1)
                .unwrap_or(u64::MAX);

            msg!("⚠️ HIGH VALUE TRANSFER DETECTED");
            msg!("   Amount {} >= Threshold {}", amount, threshold);

            // Emit event for monitoring
            emit!(HighValueTransferDetected {
                mint: hook_config.mint,
                sender: ctx.accounts.sender.key(),
                amount,
                threshold,
                identity_pda: sender_identity.key(),
                enforcement_mode: hook_config.enforcement_mode,
            });

            match hook_config.enforcement_mode {
                EnforcementMode::Disabled => {
                    msg!("   Mode: DISABLED - Transfer ALLOWED");
                }
                EnforcementMode::SoftEnforce => {
                    msg!("   Mode: SOFT ENFORCEMENT - Transfer ALLOWED (logged)");
                    msg!("   ⚡ In production: Would require ML-DSA signature");
                }
                EnforcementMode::HardEnforce => {
                    msg!("❌ Mode: HARD ENFORCEMENT - Transfer BLOCKED");
                    msg!("   Quantum signature required but not provided");
                    return Err(QuresisHookError::QuantumSignatureRequired.into());
                }
            }
        } else {
            msg!("✅ Transfer ALLOWED (below threshold)");
        }

        Ok(())
    }

    /// Update the enforcement mode for a hook
    pub fn update_enforcement_mode(
        ctx: Context<UpdateHookConfig>,
        new_mode: EnforcementMode,
    ) -> Result<()> {
        let hook_config = &mut ctx.accounts.hook_config;
        let old_mode = hook_config.enforcement_mode;
        
        hook_config.enforcement_mode = new_mode;

        emit!(EnforcementModeUpdated {
            mint: hook_config.mint,
            old_mode,
            new_mode,
            updated_by: ctx.accounts.authority.key(),
        });

        msg!("📊 Enforcement Mode Updated: {:?} -> {:?}", old_mode, new_mode);

        Ok(())
    }

    /// Get statistics for a hook
    pub fn get_statistics(ctx: Context<GetStatistics>) -> Result<()> {
        let hook_config = &ctx.accounts.hook_config;

        msg!("📊 Quresis Hook Statistics");
        msg!("   Mint: {}", hook_config.mint);
        msg!("   Enforcement Mode: {:?}", hook_config.enforcement_mode);
        msg!("   Total Transfers Checked: {}", hook_config.total_transfers_checked);
        msg!("   High Value Transfers: {}", hook_config.high_value_transfers_detected);

        Ok(())
    }
}

// ============================================================================
// ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeHook<'info> {
    /// The mint this hook is attached to
    /// CHECK: We only store the pubkey
    pub mint: AccountInfo<'info>,

    /// The hook configuration PDA
    #[account(
        init,
        payer = authority,
        space = 8 + HookConfig::INIT_SPACE,
        seeds = [b"quresis_hook", mint.key().as_ref()],
        bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// The authority who can update hook settings
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTransferCheck<'info> {
    /// The hook configuration PDA
    #[account(
        mut,
        seeds = [b"quresis_hook", hook_config.mint.as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// The sender wallet (for identity lookup)
    pub sender: Signer<'info>,

    /// The sender's Quantum Identity PDA
    /// CHECK: May or may not exist - we handle both cases
    #[account(
        seeds = [b"quresis_id", sender.key().as_ref()],
        bump,
        seeds::program = quresis::ID,
    )]
    pub sender_identity: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateHookConfig<'info> {
    /// The hook configuration PDA
    #[account(
        mut,
        seeds = [b"quresis_hook", hook_config.mint.as_ref()],
        bump = hook_config.bump,
        has_one = authority,
    )]
    pub hook_config: Account<'info, HookConfig>,

    /// The authority
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetStatistics<'info> {
    /// The hook configuration PDA
    #[account(
        seeds = [b"quresis_hook", hook_config.mint.as_ref()],
        bump = hook_config.bump,
    )]
    pub hook_config: Account<'info, HookConfig>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct HookConfig {
    /// The mint this hook is attached to
    pub mint: Pubkey,
    /// The authority who can update settings
    pub authority: Pubkey,
    /// The enforcement mode
    pub enforcement_mode: EnforcementMode,
    /// Total transfers checked by this hook
    pub total_transfers_checked: u64,
    /// High value transfers detected
    pub high_value_transfers_detected: u64,
    /// PDA bump
    pub bump: u8,
}

impl HookConfig {
    pub const INIT_SPACE: usize = 32 + 32 + 1 + 8 + 8 + 1; // 82 bytes
}

/// Enforcement mode for the hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum EnforcementMode {
    /// Hook is disabled - all transfers allowed
    Disabled,
    /// Soft enforcement - logs high-value transfers but allows them
    SoftEnforce,
    /// Hard enforcement - blocks high-value transfers without PQC signature
    HardEnforce,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct HighValueTransferDetected {
    pub mint: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
    pub threshold: u64,
    pub identity_pda: Pubkey,
    pub enforcement_mode: EnforcementMode,
}

#[event]
pub struct EnforcementModeUpdated {
    pub mint: Pubkey,
    pub old_mode: EnforcementMode,
    pub new_mode: EnforcementMode,
    pub updated_by: Pubkey,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum QuresisHookError {
    #[msg("Quantum signature is required for this transfer amount.")]
    QuantumSignatureRequired,

    #[msg("Quantum signature verification failed.")]
    InvalidQuantumSignature,

    #[msg("The sender's Quantum Identity is frozen.")]
    IdentityFrozen,

    #[msg("Transfer amount exceeds allowed limit without PQC authorization.")]
    TransferExceedsLimit,

    #[msg("Hook is not initialized for this mint.")]
    HookNotInitialized,

    #[msg("Invalid identity data format.")]
    InvalidIdentityData,
}
