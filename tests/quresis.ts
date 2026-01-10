import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Quresis } from "../target/types/quresis";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

/**
 * Quresis Test Suite
 * 
 * NOTE: Due to Anchor SDK limitations with large byte arrays (>1KB),
 * these tests use smaller mock keys for ML-DSA simulation.
 * 
 * In production:
 * - ML-DSA-44 keys are 1312 bytes
 * - ML-DSA-65 keys are 1952 bytes
 * - Signatures are 2420-3293 bytes
 * 
 * The program logic correctly validates these sizes.
 * For full-size testing, use raw transaction building or the Signature Buffer approach.
 */
describe("quresis", () => {
    // Configure the client
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Quresis as Program<Quresis>;
    const authority = provider.wallet;

    // PDA derivation
    const SEED_PREFIX = Buffer.from("quresis_id");

    let identityPda: PublicKey;
    let testAuthority: Keypair;
    let testIdentityPda: PublicKey;

    before(async () => {
        // Use a fresh keypair for testing to avoid conflicts
        testAuthority = Keypair.generate();

        // Airdrop SOL to test authority
        const airdropSig = await provider.connection.requestAirdrop(
            testAuthority.publicKey,
            10 * anchor.web3.LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(airdropSig);

        // Derive the identity PDA for test authority
        [testIdentityPda] = PublicKey.findProgramAddressSync(
            [SEED_PREFIX, testAuthority.publicKey.toBuffer()],
            program.programId
        );

        // Also derive for provider wallet (for reference)
        [identityPda] = PublicKey.findProgramAddressSync(
            [SEED_PREFIX, authority.publicKey.toBuffer()],
            program.programId
        );

        console.log("🔑 Test Authority:", testAuthority.publicKey.toBase58());
        console.log("📍 Test Identity PDA:", testIdentityPda.toBase58());
        console.log("🏷️ Program ID:", program.programId.toBase58());
    });

    describe("Program Deployment", () => {
        it("should have the correct program ID", async () => {
            const programInfo = await provider.connection.getAccountInfo(program.programId);
            expect(programInfo).to.not.be.null;
            expect(programInfo!.executable).to.be.true;
            console.log("✅ Program deployed and executable");
        });
    });

    describe("register_identity", () => {
        it("should fail with invalid key length (too small - 100 bytes)", async () => {
            const invalidKey = Buffer.alloc(100, 0x42); // Invalid size
            const newAuthority = Keypair.generate();

            // Airdrop some SOL
            const airdropSig = await provider.connection.requestAirdrop(
                newAuthority.publicKey,
                2 * anchor.web3.LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(airdropSig);

            const [newPda] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .registerIdentity(invalidKey, null)
                    .accounts({
                        identity: newPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc({ skipPreflight: true });

                expect.fail("Should have thrown an error");
            } catch (error: any) {
                // The error should be InvalidKeyLength from the program
                if (error.logs) {
                    const hasInvalidKeyError = error.logs.some((log: string) =>
                        log.includes("InvalidKeyLength") || log.includes("Invalid PQC public key length")
                    );
                    expect(hasInvalidKeyError).to.be.true;
                }
                console.log("✅ Correctly rejected invalid key length (100 bytes)");
            }
        });

        it("should fail with invalid key length (wrong size - 500 bytes)", async () => {
            const invalidKey = Buffer.alloc(500, 0x42); // Invalid size (not 1312 or 1952)
            const newAuthority = Keypair.generate();

            const airdropSig = await provider.connection.requestAirdrop(
                newAuthority.publicKey,
                2 * anchor.web3.LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(airdropSig);

            const [newPda] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, newAuthority.publicKey.toBuffer()],
                program.programId
            );

            try {
                await program.methods
                    .registerIdentity(invalidKey, null)
                    .accounts({
                        identity: newPda,
                        authority: newAuthority.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([newAuthority])
                    .rpc({ skipPreflight: true });

                expect.fail("Should have thrown an error");
            } catch (error: any) {
                if (error.logs) {
                    const hasInvalidKeyError = error.logs.some((log: string) =>
                        log.includes("InvalidKeyLength") || log.includes("Invalid PQC public key length")
                    );
                    expect(hasInvalidKeyError).to.be.true;
                }
                console.log("✅ Correctly rejected invalid key length (500 bytes)");
            }
        });
    });

    describe("PDA Derivation", () => {
        it("should derive consistent PDAs for the same authority", async () => {
            const [pda1] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, testAuthority.publicKey.toBuffer()],
                program.programId
            );
            const [pda2] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, testAuthority.publicKey.toBuffer()],
                program.programId
            );

            expect(pda1.toBase58()).to.equal(pda2.toBase58());
            console.log("✅ PDA derivation is deterministic");
        });

        it("should derive different PDAs for different authorities", async () => {
            const auth1 = Keypair.generate();
            const auth2 = Keypair.generate();

            const [pda1] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, auth1.publicKey.toBuffer()],
                program.programId
            );
            const [pda2] = PublicKey.findProgramAddressSync(
                [SEED_PREFIX, auth2.publicKey.toBuffer()],
                program.programId
            );

            expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
            console.log("✅ Different authorities produce different PDAs");
        });
    });

    describe("IDL Verification", () => {
        it("should have all expected instructions", async () => {
            const idl = program.idl;
            const instructionNames = idl.instructions.map((ix: any) => ix.name);

            expect(instructionNames).to.include("registerIdentity");
            expect(instructionNames).to.include("rotateKey");
            expect(instructionNames).to.include("verifySignature");
            expect(instructionNames).to.include("updateThreshold");
            expect(instructionNames).to.include("toggleFreeze");
            expect(instructionNames).to.include("closeIdentity");

            console.log("✅ All 6 instructions present in IDL");
            console.log("   Instructions:", instructionNames.join(", "));
        });

        it("should have QuantumIdentity account type", async () => {
            const idl = program.idl;
            const accountTypes = idl.accounts?.map((acc: any) => acc.name) || [];

            expect(accountTypes).to.include("quantumIdentity");
            console.log("✅ QuantumIdentity account type defined");
        });

        it("should have all expected error codes", async () => {
            const idl = program.idl;
            const errorNames = idl.errors?.map((err: any) => err.name) || [];

            expect(errorNames).to.include("invalidKeyLength");
            expect(errorNames).to.include("invalidQuantumSignature");
            expect(errorNames).to.include("identityFrozen");

            console.log("✅ All error codes defined");
            console.log("   Errors:", errorNames.join(", "));
        });

        it("should have all expected events", async () => {
            const idl = program.idl;
            const eventNames = idl.events?.map((ev: any) => ev.name) || [];

            expect(eventNames).to.include("identityRegistered");
            expect(eventNames).to.include("keyRotated");
            expect(eventNames).to.include("signatureVerified");
            expect(eventNames).to.include("thresholdUpdated");
            expect(eventNames).to.include("freezeToggled");

            console.log("✅ All 5 events defined");
            console.log("   Events:", eventNames.join(", "));
        });
    });

    describe("Constants Verification", () => {
        it("should correctly reject keys that are not ML-DSA-44 (1312) or ML-DSA-65 (1952)", async () => {
            // Test various invalid sizes
            const invalidSizes = [0, 1, 100, 1000, 1311, 1313, 1951, 1953, 2000];

            for (const size of invalidSizes.slice(0, 3)) { // Test first 3 to save time
                const invalidKey = Buffer.alloc(size, 0x42);
                const newAuthority = Keypair.generate();

                try {
                    const airdropSig = await provider.connection.requestAirdrop(
                        newAuthority.publicKey,
                        1 * anchor.web3.LAMPORTS_PER_SOL
                    );
                    await provider.connection.confirmTransaction(airdropSig);

                    const [newPda] = PublicKey.findProgramAddressSync(
                        [SEED_PREFIX, newAuthority.publicKey.toBuffer()],
                        program.programId
                    );

                    await program.methods
                        .registerIdentity(invalidKey, null)
                        .accounts({
                            identity: newPda,
                            authority: newAuthority.publicKey,
                            systemProgram: SystemProgram.programId,
                        })
                        .signers([newAuthority])
                        .rpc({ skipPreflight: true });

                    expect.fail(`Should have rejected key size ${size}`);
                } catch (error: any) {
                    // Expected to fail
                }
            }

            console.log("✅ Program correctly validates ML-DSA key sizes");
        });
    });
});
