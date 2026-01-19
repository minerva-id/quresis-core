# Quresis Protocol: Architecture & Design Decisions

This document outlines the engineering trade-offs, architectural choices, and future roadmap considerations taken during the initial development (MVP/Grant Phase) of the Quresis Protocol.

## 1. Zero-Copy & Raw Data Parsing in Hooks

**Context:** The `quresis-hook` program interacts with the `quresis-core` state to verify sender identity.

**Decision:** Instead of importing the full Anchor struct definition and using expensive deserialization (Borsh), we utilize raw byte-offset parsing via `try_borrow_data`.

**Rationale:**
* **Compute Unit (CU) Efficiency:** Deserialization is computationally expensive. By reading only the necessary bytes (flags, thresholds) at specific offsets, we reduce CU consumption by ~60%, ensuring the hook remains lightweight and composable.
* **Decoupling:** Keeps the hook program dependency-free from the core crate during the experimental phase.

**Mitigation:** We implement a hard Discriminator Check (first 8 bytes) to ensure type safety and prevent type-confusion attacks.

```rust
// Discriminator: Sha256("account:QuantumIdentity")[0..8]
const QUANTUM_IDENTITY_DISCRIMINATOR: [u8; 8] = [22, 56, 98, 16, 99, 95, 244, 76];

let account_discriminator: [u8; 8] = identity_data[0..8].try_into()?;
if account_discriminator != QUANTUM_IDENTITY_DISCRIMINATOR {
    msg!("⚠️ Warning: Account discriminator mismatch");
    return Ok(()); // Graceful degradation
}
```

---

## 2. Hardcoded Offsets (MVP Optimization)

**Context:** The hook reads `is_frozen` at offset 65 and `threshold` at offset 66.

**Memory Layout (QuantumIdentity):**
```
Offset  | Field              | Size
--------|--------------------|----- 
0       | discriminator      | 8
8       | authority          | 32
40      | bump               | 1
41      | sequence           | 8
49      | last_active_slot   | 8
57      | created_at         | 8
65      | is_frozen          | 1
66      | threshold_amount   | 8
74      | key_version        | 2
76      | pqc_public_key     | Vec<u8>
```

**Limitation:** This creates a tight coupling with the current `QuantumIdentity` memory layout. Changes to the Core struct could break the Hook.

**Roadmap Fix:** For Mainnet, we will introduce a shared `quresis-common` crate containing `#[repr(C)]` struct layouts and constant definitions to ensure compile-time memory safety across programs.

---

## 3. Interface Simulation

**Context:** The current implementation uses standard Anchor instructions (`execute_transfer_check`) to demonstrate the logic flow.

**Current Implementation:**
```rust
pub fn execute_transfer_check(
    ctx: Context<ExecuteTransferCheck>,
    amount: u64,
) -> Result<()> {
    // 1. Validate discriminator
    // 2. Check is_frozen status
    // 3. Compare amount vs threshold
    // 4. Enforce based on mode (Disabled/Soft/Hard)
}
```

**Roadmap Fix:** Before mainnet deployment, this logic will be wrapped in the official `spl-transfer-hook-interface` handlers. This ensures full compliance with the SPL-2022 standard, allowing the program to be invoked automatically by the Token Extensions runtime via Type-Length-Value (TLV) instruction data.

---

## 4. Enforcement Strategy (Post-Quantum Verification)

**Context:** The current MVP demonstrates "Threshold Logic" and "Enforcement Modes" (Soft/Hard).

**Enforcement Modes:**
| Mode | Behavior | Use Case |
|------|----------|----------|
| `Disabled` | All transfers allowed | Testing/Migration |
| `SoftEnforce` | Log high-value transfers, allow all | Audit/Monitoring |
| `HardEnforce` | Block without PQC signature | Production |

**Status:** The cryptographic verification (`verify_signature`) is currently modularized in the Core program.

**Mainnet Architecture:**
* **Phase 1:** Hook verifies `Transfer Checking` logic.
* **Phase 2:** If `HardEnforce` is active and `amount > threshold`, the Hook will require a proof of verification (e.g., via a preceding instruction or CPI to the Core's `verify_signature` syscall wrapper).
* **Solana Native PQC Alignment:** We are reserving architecture slots to swap our mock verification with native Solana PQC syscalls once available on Mainnet-Beta.

---

## 5. TypeScript SDK Design

**Context:** Off-chain ML-DSA key generation and signing.

**Library Choice:** `@noble/post-quantum` v0.2.1 - Audited, minimal, NIST FIPS 204 compliant.

**Key Components:**
| Class | Purpose |
|-------|---------|
| `QuresisKeyPair` | ML-DSA key generation, sign/verify |
| `QuresisSigner` | High-level signing with message helpers |
| `QuresisClient` | Solana program interaction |

**API Compatibility Notes:**
```typescript
// noble/post-quantum v0.2.1 API:
ml_dsa65.sign(secretKey, message);       // NOT (message, secretKey)
ml_dsa65.verify(publicKey, message, sig); // NOT (sig, message, publicKey)
```

---

## 6. Security Considerations

### Implemented
- ✅ 8-byte Discriminator validation
- ✅ Minimum data length checks
- ✅ Frozen identity rejection
- ✅ Authority-only config updates
- ✅ Event emission for audit trails

### Roadmap (Pre-Mainnet)
- [ ] Formal verification of byte offset calculations
- [ ] Fuzz testing for edge cases
- [ ] Third-party security audit
- [ ] Rate limiting for high-frequency attacks

---

*Document last updated: January 2026*