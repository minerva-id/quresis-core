# 🏛️ Quresis Protocol: Technical Blueprint v1.0

**Target Architecture:** Solana SVM (SPL-2022 + Native PQC Primitives)
**Bahasa:** Rust (Anchor Framework)

---

## 1. High-Level Architecture

Quresis bukan sekadar smart contract tunggal, melainkan sebuah **Sistem Orkestrasi Keamanan** yang terdiri dari 3 komponen utama:

1. **On-Chain Registry (`quresis-core`):** Program utama yang menyimpan pemetaan antara *Solana Wallet (Ed25519)* dengan *Quantum Public Key (ML-DSA)*.
2. **The Guard Hook (`quresis-hook`):** Program implementasi *Transfer Hook Interface* (SPL-2022) yang mencegat transaksi token dan memaksakan validasi PQC.
3. **Native PQC Interface:** Wrapper layer yang memanggil *Native Syscalls* Solana untuk verifikasi kriptografi (agar efisien CU).

---

## 2. On-Chain Data Structures (State Management)

Kita menggunakan **PDA (Program Derived Address)** untuk menyimpan identitas kuantum user tanpa membebani storage validator.

### A. The Quantum Identity (PDA)

Ini adalah akun yang dibuat user saat pertama kali mendaftar ke Quresis.

**Seeds:** `[b"quresis_id", user_wallet.key().as_ref()]`

```rust
#[account]
pub struct QuantumIdentity {
    // 1. Ownership & Authority
    pub authority: Pubkey,          // Wallet Solana asli (Ed25519)
    pub bump: u8,                   // PDA bump

    // 2. Quantum Credentials
    // ML-DSA-44 or ML-DSA-65 Public Key (dari NIST FIPS 204 specs)
    // Disimpan sebagai byte array raw untuk efisiensi.
    pub pqc_public_key: Vec<u8>,    

    // 3. Security Metadata
    pub sequence: u64,              // Anti-replay nonce untuk signature PQC
    pub last_active_slot: u64,      // Timestamp aktivitas terakhir
    pub is_frozen: bool,            // Emergency freeze (jika kunci kompromi)
    
    // 4. Configuration
    pub threshold_amount: u64,      // Opsional: Limit transaksi yang butuh PQC (misal > 100 SOL)
}

// Perkiraan Ukuran: 8 (disc) + 32 + 1 + 1312 (ML-DSA-44 pk) + 8 + 8 + 1 + 8 
// Total: ~1.4 KB per user (Sangat hemat rent)

```

---

## 3. Program Logic & Instruction Flow

Berikut adalah alur logika (Business Logic) yang harus diimplementasikan di Rust.

### Modul 1: Identity Management (`quresis-core`)

#### Instruction: `register_identity`

* **Input:** `pqc_public_key` (bytes).
* **Logic:**
1. Cek apakah PDA `QuantumIdentity` sudah ada.
2. Verifikasi format `pqc_public_key` valid (sesuai standar ML-DSA).
3. Simpan ke akun PDA.
4. Emit event `IdentityRegistered`.



#### Instruction: `rotate_key`

* **Input:** `new_pqc_key`, `signature_using_OLD_key`.
* **Logic:**
1. User harus menandatangani request ini menggunakan kunci PQC lama (Post-Quantum 2FA).
2. Jika valid, update public key di storage.
3. Ini fitur krusial untuk "Long-term Security".



---

### Modul 2: The Guard (`quresis-hook`) - **INTI DARI GRANT**

Ini adalah implementasi standar **SPL-2022 Transfer Hook**.

#### Instruction: `execute` (Dipanggil otomatis oleh Token Program)

* **Context:** Saat user mengirim token RWA.
* **Logic:**
1. **Deserialization:** Baca metadata transfer (Sender, Receiver, Amount).
2. **Amount Check:**
* `if amount < limit`: `return Ok(())` (Lewati cek untuk transaksi kecil).
* `if amount >= limit`: Lanjut ke validasi PQC.


3. **Fetch Identity:** Load akun `QuantumIdentity` milik Sender.
4. **Signature Verification (The Magic):**
* Ambil `pqc_signature` yang dilampirkan dalam transaksi (via *instruction introspection* atau *extra account metas*).
* Panggil native PQC syscall:
```rust
// Pseudo-code wrapper
let is_valid = solana_program::pqc::verify_ml_dsa(
    &identity.pqc_public_key,
    &transaction_message,
    &pqc_signature
);

```




5. **Enforcement:**
* Jika `is_valid == true`: `return Ok(())`
* Jika `is_valid == false`: `return Err(QuresisError::InvalidQuantumSignature)` (Transaksi Revert).





---

## 4. Addressing Solana Constraints (Technical Challenges)

Blueprint ini menangani batasan Solana dengan strategi berikut:

### A. Compute Budget (CU)

Algoritma PQC berat. Verifikasi di *user-space* (Rust biasa) akan memakan >1 Juta CU (gagal tx).

* **Solusi:** Kita menggunakan **Precompiles/Syscalls**.
* **Detail:** Proposal kita berasumsi Solana mengekspos verifikasi ini sebagai fungsi native validator (syscall). Biaya CU-nya akan fix dan murah (misal 5,000 CU), bukan 1 Juta CU.

### B. Transaction Size (Packet Limits 1232 Bytes)

Signature ML-DSA cukup besar (~2.4KB). Tidak muat di transaksi standar.

* **Solusi:** **Address Lookup Tables (LUTs) + Ed25519 Instruction Introspection.**
* **Alternative Flow (Jika Syscall belum support streaming):**
1. User mengirim signature PQC ke "Signature Buffer Account" (transaksi terpisah).
2. Transaksi Transfer Token hanya merujuk ke Buffer tersebut.
3. Program Quresis memverifikasi isi Buffer.



---

## 5. Interface for Developers (SDK Design)

Ini adalah apa yang akan digunakan oleh klien lain (Integrator).

**Package:** `@quresis/sdk` (TypeScript)

```typescript
// 1. Inisialisasi Kunci PQC (Off-chain)
const pqcKeypair = await Quresis.Keypair.generate("ML-DSA-44");

// 2. Register Identity on Solana
await program.methods
  .registerIdentity(pqcKeypair.publicKey)
  .accounts({ ... })
  .signers([solanaWallet])
  .rpc();

// 3. Melakukan Transfer RWA (Hybrid Sign)
const transferTx = new Transaction();
transferTx.add(
  createTransferCheckedInstruction(..., amount)
);

// Quresis SDK otomatis menyisipkan PQC Signature ke transaksi
const quantumTx = await Quresis.signAndSend(
  connection,
  transferTx,
  solanaWallet, // Tanda tangan Ed25519
  pqcKeypair    // Tanda tangan ML-DSA
);

```

---

## 6. Implementation Stages (Roadmap Eksekusi)

**Minggu 1: The Core**

* Setup Anchor Project `quresis-protocol`.
* Definisikan struct `QuantumIdentity`.
* Buat mock instruction `register` dan `update`.

**Minggu 2: The Mock Interface**

* Karena native PQC syscalls mungkin belum publik 100%, kita buat **Mock Verifier**.
* Buat fungsi dummy Rust: `verify_ml_dsa_mock(pubkey, sig) -> bool`.
* Tujuannya agar struktur program selesai dulu. Nanti tinggal ganti fungsi mock ini dengan syscall asli saat rilis.

**Minggu 3: The Hook**

* Implementasi `spl-transfer-hook-interface`.
* Integrasi logika `verify` ke dalam hook.
* Deploy ke Devnet dengan token SPL-2022 custom.

---