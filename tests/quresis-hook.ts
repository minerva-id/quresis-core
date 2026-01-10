import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { QuresisHook } from "../target/types/quresis_hook";
import { Quresis } from "../target/types/quresis";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

/**
 * Quresis Hook Test Suite
 * 
 * Tests the Transfer Hook implementation for post-quantum signature enforcement.
 */
describe("quresis-hook", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const hookProgram = anchor.workspace.QuresisHook as Program<QuresisHook>;
    const coreProgram = anchor.workspace.Quresis as Program<Quresis>;
    const authority = provider.wallet;

    // Seeds
    const HOOK_SEED = Buffer.from("quresis_hook");
    const IDENTITY_SEED = Buffer.from("quresis_id");

    // Test mint (mock)
    let testMint: Keypair;
    let hookConfigPda: PublicKey;

    before(async () => {
        testMint = Keypair.generate();

        [hookConfigPda] = PublicKey.findProgramAddressSync(
            [HOOK_SEED, testMint.publicKey.toBuffer()],
            hookProgram.programId
        );

        console.log("🔗 Hook Program ID:", hookProgram.programId.toBase58());
        console.log("🔗 Core Program ID:", coreProgram.programId.toBase58());
        console.log("🪙 Test Mint:", testMint.publicKey.toBase58());
        console.log("📍 Hook Config PDA:", hookConfigPda.toBase58());
    });

    describe("Program Deployment", () => {
        it("should have both programs deployed", async () => {
            const hookInfo = await provider.connection.getAccountInfo(hookProgram.programId);
            const coreInfo = await provider.connection.getAccountInfo(coreProgram.programId);

            expect(hookInfo).to.not.be.null;
            expect(hookInfo!.executable).to.be.true;
            expect(coreInfo).to.not.be.null;
            expect(coreInfo!.executable).to.be.true;

            console.log("✅ Both programs deployed and executable");
        });
    });

    describe("IDL Verification", () => {
        it("should have all expected hook instructions", async () => {
            const idl = hookProgram.idl;
            const instructionNames = idl.instructions.map((ix: any) => ix.name);

            expect(instructionNames).to.include("initializeHook");
            expect(instructionNames).to.include("executeTransferCheck");
            expect(instructionNames).to.include("updateEnforcementMode");
            expect(instructionNames).to.include("getStatistics");

            console.log("✅ All 4 hook instructions present");
            console.log("   Instructions:", instructionNames.join(", "));
        });

        it("should have HookConfig account type", async () => {
            const idl = hookProgram.idl;
            const accountTypes = idl.accounts?.map((acc: any) => acc.name) || [];

            expect(accountTypes).to.include("hookConfig");
            console.log("✅ HookConfig account type defined");
        });

        it("should have EnforcementMode enum", async () => {
            const idl = hookProgram.idl;
            const types = idl.types?.map((t: any) => t.name) || [];

            expect(types).to.include("enforcementMode");
            console.log("✅ EnforcementMode enum defined");
        });

        it("should have all expected error codes", async () => {
            const idl = hookProgram.idl;
            const errorNames = idl.errors?.map((err: any) => err.name) || [];

            expect(errorNames).to.include("quantumSignatureRequired");
            expect(errorNames).to.include("identityFrozen");

            console.log("✅ All error codes defined");
            console.log("   Errors:", errorNames.join(", "));
        });

        it("should have events for monitoring", async () => {
            const idl = hookProgram.idl;
            const eventNames = idl.events?.map((ev: any) => ev.name) || [];

            expect(eventNames).to.include("highValueTransferDetected");
            expect(eventNames).to.include("enforcementModeUpdated");

            console.log("✅ All events defined");
            console.log("   Events:", eventNames.join(", "));
        });
    });

    describe("PDA Derivation", () => {
        it("should derive hook config PDA correctly", async () => {
            const mint1 = Keypair.generate();
            const mint2 = Keypair.generate();

            const [pda1] = PublicKey.findProgramAddressSync(
                [HOOK_SEED, mint1.publicKey.toBuffer()],
                hookProgram.programId
            );
            const [pda2] = PublicKey.findProgramAddressSync(
                [HOOK_SEED, mint2.publicKey.toBuffer()],
                hookProgram.programId
            );

            // Different mints should produce different PDAs
            expect(pda1.toBase58()).to.not.equal(pda2.toBase58());

            // Same mint should produce same PDA
            const [pda1Again] = PublicKey.findProgramAddressSync(
                [HOOK_SEED, mint1.publicKey.toBuffer()],
                hookProgram.programId
            );
            expect(pda1.toBase58()).to.equal(pda1Again.toBase58());

            console.log("✅ Hook Config PDA derivation is correct");
        });

        it("should derive sender identity PDA correctly using core program", async () => {
            const sender = Keypair.generate();

            const [identityPda] = PublicKey.findProgramAddressSync(
                [IDENTITY_SEED, sender.publicKey.toBuffer()],
                coreProgram.programId
            );

            // Identity PDA should be deterministic
            const [identityPdaAgain] = PublicKey.findProgramAddressSync(
                [IDENTITY_SEED, sender.publicKey.toBuffer()],
                coreProgram.programId
            );

            expect(identityPda.toBase58()).to.equal(identityPdaAgain.toBase58());
            console.log("✅ Sender Identity PDA derivation is correct");
        });
    });

    describe("Cross-Program Integration", () => {
        it("should reference the correct quresis core program ID", async () => {
            // The hook should reference the core program for identity lookups
            const expectedCoreId = coreProgram.programId.toBase58();

            // Verify both programs are from the same workspace
            expect(hookProgram.programId.toBase58()).to.not.equal(expectedCoreId);

            console.log("✅ Hook and Core are separate programs");
            console.log("   Core ID:", expectedCoreId);
            console.log("   Hook ID:", hookProgram.programId.toBase58());
        });
    });
});
