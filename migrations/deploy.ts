// Migrations are an early feature. Currently, they're nothing more than this
// temporary script that calls into the deployment workflow.

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (provider: anchor.AnchorProvider) {
    // Configure client to use the provider.
    anchor.setProvider(provider);

    // Add your deploy logic here.
    console.log("🚀 Quresis Protocol Deployment");
    console.log("   Provider:", provider.connection.rpcEndpoint);
};
