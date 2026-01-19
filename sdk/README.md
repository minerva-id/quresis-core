# @quresis/sdk

**Post-Quantum Cryptography SDK for Solana RWAs**

The official TypeScript SDK for the Quresis Protocol, providing ML-DSA (Module-Lattice Digital Signature Algorithm) key generation, signing, and on-chain interaction with Quresis programs on Solana.

## Installation

```bash
npm install @quresis/sdk
# or
yarn add @quresis/sdk
# or
pnpm add @quresis/sdk
```

## Quick Start

```typescript
import { 
  QuresisKeyPair, 
  QuresisSigner,
  QuresisClient 
} from '@quresis/sdk';
import { Connection, Keypair } from '@solana/web3.js';

// 1. Generate a quantum-resistant keypair
const keypair = QuresisKeyPair.generate('ML-DSA-44');
console.log(`Generated ${keypair.variant} keypair`);
console.log(`Public key size: ${keypair.publicKey.length} bytes`);

// 2. Create a signer
const signer = new QuresisSigner(keypair);

// 3. Sign a message
const message = new TextEncoder().encode('Transfer 1000 tokens to Alice');
const signature = await signer.sign(message);
console.log(`Signature size: ${signature.bytes.length} bytes`);

// 4. Verify the signature
const isValid = signer.verify(message, signature.bytes);
console.log(`Signature valid: ${isValid}`);

// 5. Connect to Solana and register identity
const connection = new Connection('https://api.devnet.solana.com');
const client = new QuresisClient({
  connection,
  wallet: yourWallet, // Solana wallet adapter
  network: 'devnet',
});

// Register your quantum identity on-chain
const txSig = await client.registerIdentity(keypair.publicKey);
console.log(`Registered! TX: ${txSig}`);
```

## Features

### 🔐 ML-DSA Key Generation

Generate NIST-approved post-quantum keypairs:

```typescript
// ML-DSA-44 (Security Level 2, smaller keys)
const keypair44 = QuresisKeyPair.generate('ML-DSA-44');

// ML-DSA-65 (Security Level 3, larger keys)
const keypair65 = QuresisKeyPair.generate('ML-DSA-65');

// Deterministic generation from seed
const seed = crypto.getRandomValues(new Uint8Array(32));
const keypair = QuresisKeyPair.generate('ML-DSA-44', { seed });
```

### ✍️ Message Signing

Sign messages with quantum-resistant signatures:

```typescript
const signer = new QuresisSigner(keypair);

// Sign any message
const signature = await signer.sign(messageBytes);

// Create standardized messages
const rotationMsg = signer.createRotationMessage(newPublicKey, sequence);
const transferMsg = signer.createTransferMessage(amount, destination, sequence);
```

### 🌐 On-Chain Interaction

Interact with Quresis programs on Solana:

```typescript
const client = new QuresisClient({ connection, wallet });

// Check if identity exists
const hasId = await client.hasIdentity(wallet.publicKey);

// Get identity details
const identity = await client.getIdentity(wallet.publicKey);

// Update threshold
await client.updateThreshold(BigInt(50_000_000_000)); // 50 SOL

// Emergency freeze
await client.toggleFreeze();
```

### 💾 Key Serialization

Securely store and restore keypairs:

```typescript
// Serialize (⚠️ includes secret key!)
const serialized = keypair.serialize('my-identity-label');
localStorage.setItem('quresis_key', JSON.stringify(serialized));

// Restore
const restored = QuresisKeyPair.fromSerialized(
  JSON.parse(localStorage.getItem('quresis_key'))
);
```

## Constants

| Variant | Public Key | Secret Key | Signature | Security Level |
|---------|------------|------------|-----------|----------------|
| ML-DSA-44 | 1,312 bytes | 2,560 bytes | 2,420 bytes | NIST Level 2 |
| ML-DSA-65 | 1,952 bytes | 4,032 bytes | 3,293 bytes | NIST Level 3 |

## Program IDs

| Program | Devnet |
|---------|--------|
| `quresis` | `7SwY7dD2rQTvWs8KUB1xsy3GuUbKBoJdcPvx8kGiuojv` |
| `quresis-hook` | `9P6cDkGwt3AADtVtFLy3nCHz3ZDLnMLpscUmVFqosvB4` |

## API Reference

### QuresisKeyPair

```typescript
class QuresisKeyPair {
  static generate(variant?: MLDSAVariant, options?: KeyPairOptions): QuresisKeyPair;
  static fromKeys(variant: MLDSAVariant, publicKey: Uint8Array, secretKey: Uint8Array): QuresisKeyPair;
  static fromSerialized(serialized: SerializedKeyPair): QuresisKeyPair;
  
  sign(message: Uint8Array): Uint8Array;
  verify(message: Uint8Array, signature: Uint8Array): boolean;
  serialize(label?: string): SerializedKeyPair;
  
  readonly variant: MLDSAVariant;
  readonly publicKey: Uint8Array;
  readonly signatureSize: number;
  readonly securityLevel: number;
}
```

### QuresisSigner

```typescript
class QuresisSigner {
  constructor(keypair: QuresisKeyPair);
  
  sign(message: Uint8Array): Promise<QuantumSignature>;
  signRaw(message: Uint8Array): Uint8Array;
  verify(message: Uint8Array, signature: Uint8Array): boolean;
  
  createRotationMessage(newPublicKey: Uint8Array, sequence: bigint): Uint8Array;
  createTransferMessage(amount: bigint, destination: Uint8Array, sequence: bigint): Uint8Array;
  createDualSigner(ed25519Sign: Function): Function;
}
```

### QuresisClient

```typescript
class QuresisClient {
  constructor(config: QuresisClientConfig);
  
  getIdentityPda(authority: PublicKey): { pda: PublicKey; bump: number };
  getIdentity(authority: PublicKey): Promise<QuantumIdentity | null>;
  hasIdentity(authority: PublicKey): Promise<boolean>;
  
  registerIdentity(pqcPublicKey: Uint8Array, threshold?: bigint): Promise<string>;
  updateThreshold(newThreshold: bigint): Promise<string>;
  toggleFreeze(): Promise<string>;
  
  getHookConfigPda(mint: PublicKey): { pda: PublicKey; bump: number };
  getHookConfig(mint: PublicKey): Promise<HookConfig | null>;
}
```

## Security Considerations

1. **Secret Key Storage**: Never expose secret keys in client-side code or public repositories
2. **Threshold Configuration**: Set appropriate thresholds based on your security requirements
3. **Key Rotation**: Regularly rotate quantum keys for enhanced security
4. **Audit Trail**: Use the emitted events to maintain an audit trail of signature verifications

## License

Apache 2.0 - See [LICENSE](../LICENSE) for details.

## Links

- [Quresis Protocol](https://github.com/Quresis-Protocol/quresis-core)
- [Solana Explorer (Devnet)](https://explorer.solana.com/address/7SwY7dD2rQTvWs8KUB1xsy3GuUbKBoJdcPvx8kGiuojv?cluster=devnet)
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
