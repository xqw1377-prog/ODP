# Devnet Evidence — dst_aurora_devnet_003

- generated: 2026-09-18T14:34:58.660Z
- cluster: `https://api.devnet.solana.com` (solana-core 4.3.0-rc.0)
- program id: `GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW`

## Keys
- project_authority: `DfByZbaFZCh1nMsJwPCkLzMFjhC2FTnHE7SLobAvnzkF`
- maya: `BGu7XoF86KA4hTJDoVFb4izKa23MZxsyrecJ9r4FNSS9`
- dan: `2GAcVyic6XNUrgWMjh1CwDg8zfbYx9RVz5HWbABb7nhr`
- sib: `HtDM65Fbfg5c7EMp7noMUUpRWUYX6CoUyVYG8rNvNsMv`

## Snapshot
- cluster_version: `4.3.0-rc.0`
- demo_mint: `BZ1wT1MjggbVJTAQESejwkuVARfKbwPb1153z6RwuKeq`
- distribution_pda: `2jHkRNd8iXD7rLNMVhWHaiVwXdktrqgpLHR3hmiybyHN`
- vault: `21dmyeSNH1JoKjoHhbghRCzCGZ56aFiy2ejXddMCtj4Q`
- allocation_maya: `5000`
- allocation_dan: `5000`
- allocation_root: `75ad240d006d5bce6a0606e14a20332960c24b23da651a1d8e0e8ebeafb6bb38`
- manifest_hash: `66f3615a1cc697465334847c375817ca7b57a9bcea2eea1c7e9617be174dfeb9`
- claimed_amount: `10000`
- total_amount: `10000`
- maya_token_balance: `5000`
- dan_token_balance: `5000`
- vault_token_balance: `0`

## Transactions
### initialize_distribution
- signature: `5Mw2wSif8H7BSdUb53xkWSKZzoPzkfWRRGKMonpyKZPuAx24cnccCcd6LDvrkgiDeGqNsGTi3QtDwSEfbievy5EW`
- explorer: https://explorer.solana.com/tx/5Mw2wSif8H7BSdUb53xkWSKZzoPzkfWRRGKMonpyKZPuAx24cnccCcd6LDvrkgiDeGqNsGTi3QtDwSEfbievy5EW?cluster=devnet
### fund_distribution
- signature: `5ctbS3sM7yoXKgxcKtuFyHV7C8GUW945iWx4UtAHJ9wPnBpd22ePcYje8QwPszErRGSpPPLETt2zQGnL2pdJAMge`
- explorer: https://explorer.solana.com/tx/5ctbS3sM7yoXKgxcKtuFyHV7C8GUW945iWx4UtAHJ9wPnBpd22ePcYje8QwPszErRGSpPPLETt2zQGnL2pdJAMge?cluster=devnet
### claim_before_live_REJECTED
- signature: `4w4v9MHXd88Erhyun6QhGF83uBDhCSk9UhTBZgPveg2rRDSjazCpMjhKRRBxYZAYsPRQqB4yDJuE4tbx9gpKFcWK`
- explorer: https://explorer.solana.com/tx/4w4v9MHXd88Erhyun6QhGF83uBDhCSk9UhTBZgPveg2rRDSjazCpMjhKRRBxYZAYsPRQqB4yDJuE4tbx9gpKFcWK?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6000}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program log: AnchorError thrown in src\lib.rs:302. Error Code: InvalidStatus. Error Number: 6000. Error Message: distribution status does not allow this operation.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 16849 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1770
```
### commit_root
- signature: `4SoYxSok21ocAxPYhs2ZV8H9fT246ymKLkLKxFPuPU1o199uXabAhMQj6o3qVJvULJHEpKXFBqgPiigACruGaSKQ`
- explorer: https://explorer.solana.com/tx/4SoYxSok21ocAxPYhs2ZV8H9fT246ymKLkLKxFPuPU1o199uXabAhMQj6o3qVJvULJHEpKXFBqgPiigACruGaSKQ?cluster=devnet
### root_mutation_REJECTED
- signature: `39g27LeLKr5QXLbMQ4oqnquC3CHmBVbR6UvDPm5F4bNU2YARsYCax9V4f38pSVDKCA6kVyVcz5YZMB2zn2tMNwZA`
- explorer: https://explorer.solana.com/tx/39g27LeLKr5QXLbMQ4oqnquC3CHmBVbR6UvDPm5F4bNU2YARsYCax9V4f38pSVDKCA6kVyVcz5YZMB2zn2tMNwZA?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6000}]}`
- program log tail:
```text
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW invoke [1]
Program log: Instruction: CommitRoot
Program log: AnchorError thrown in src\lib.rs:265. Error Code: InvalidStatus. Error Number: 6000. Error Message: distribution status does not allow this operation.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 3572 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1770
```
### open_claims
- signature: `3trGEsGuSyjooJeRg6y8CAeNFsnBdi2hQU1YAjvqueGWToaAGtoemqWaz1CF72zsdsaFtQmrGNhwiPfCgtz4k3TN`
- explorer: https://explorer.solana.com/tx/3trGEsGuSyjooJeRg6y8CAeNFsnBdi2hQU1YAjvqueGWToaAGtoemqWaz1CF72zsdsaFtQmrGNhwiPfCgtz4k3TN?cluster=devnet
### wrong_amount_REJECTED
- signature: `4Ltiy9fopgNAdn9mXvP2AxzW9qD486Mt1gXPSypCbjcQFJtcStXTMuCMfyofuoYEypeQfnsdfU7YfcwgM31WtSYt`
- explorer: https://explorer.solana.com/tx/4Ltiy9fopgNAdn9mXvP2AxzW9qD486Mt1gXPSypCbjcQFJtcStXTMuCMfyofuoYEypeQfnsdfU7YfcwgM31WtSYt?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6002}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program log: AnchorError thrown in src\lib.rs:315. Error Code: InvalidProof. Error Number: 6002. Error Message: merkle proof verification failed.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 30940 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1772
```
### wrong_proof_REJECTED
- signature: `tqsRrNLNDMEncvcBJ4wPsBV5ZjmWhvKbWC9nuQvBBAejR4pCJUgDxGcVPsvvizHnrZPRLcgsoFANgSUoiiLgZV1`
- explorer: https://explorer.solana.com/tx/tqsRrNLNDMEncvcBJ4wPsBV5ZjmWhvKbWC9nuQvBBAejR4pCJUgDxGcVPsvvizHnrZPRLcgsoFANgSUoiiLgZV1?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6002}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program log: AnchorError thrown in src\lib.rs:315. Error Code: InvalidProof. Error Number: 6002. Error Message: merkle proof verification failed.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 30944 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1772
```
### sib_no_allocation_REJECTED
- signature: `3RdDHKDR5MkpV8EBMNGAvG37QeJYcQPMRAk7YkNdc6jpkaCzutSFbbFgposBPRPxuPRY1C62jdjTNRMZ6cgN7uDR`
- explorer: https://explorer.solana.com/tx/3RdDHKDR5MkpV8EBMNGAvG37QeJYcQPMRAk7YkNdc6jpkaCzutSFbbFgposBPRPxuPRY1C62jdjTNRMZ6cgN7uDR?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6002}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program log: AnchorError thrown in src\lib.rs:315. Error Code: InvalidProof. Error Number: 6002. Error Message: merkle proof verification failed.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 29496 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1772
```
### cross_distribution_REJECTED
- signature: `4GBJe4DsxgaCUueoCaCkeeouLZVGCxPQJQFYuejx5wxj1M9Pb4SjeZee9LaMjCmf2wyE4MuL4DHJzMaWMaXoQNtA`
- explorer: https://explorer.solana.com/tx/4GBJe4DsxgaCUueoCaCkeeouLZVGCxPQJQFYuejx5wxj1M9Pb4SjeZee9LaMjCmf2wyE4MuL4DHJzMaWMaXoQNtA?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":6005}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program log: AnchorError thrown in src\lib.rs:308. Error Code: DistributionIdMismatch. Error Number: 6005. Error Message: distribution_id does not match the committed hash.
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 17046 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x1775
```
### maya_claim
- signature: `2nzumtyGfqQen73z4GpyX8BAXvKz1k7bgsAuW2pJJpEWhSfLMoHG1obWUDrA74LYzxqJFJijVBNpbWURsPn2qBsQ`
- explorer: https://explorer.solana.com/tx/2nzumtyGfqQen73z4GpyX8BAXvKz1k7bgsAuW2pJJpEWhSfLMoHG1obWUDrA74LYzxqJFJijVBNpbWURsPn2qBsQ?cluster=devnet
### maya_second_claim_REJECTED
- signature: `54tvVuBUJTsZ7BM4pQoRaowdzsvkEN4UhRNxtdMc1esLDe6k4ByzNXoLyLjnM4RCfZhevNP33qN5ojS6CSQ3ajMt`
- explorer: https://explorer.solana.com/tx/54tvVuBUJTsZ7BM4pQoRaowdzsvkEN4UhRNxtdMc1esLDe6k4ByzNXoLyLjnM4RCfZhevNP33qN5ojS6CSQ3ajMt?cluster=devnet
- error: `{"InstructionError":[0,{"Custom":0}]}`
- program log tail:
```text
Program log: Instruction: Claim
Program 11111111111111111111111111111111 invoke [2]
Allocate: account Address { address: 319CfaLnp3BGPxPPENuVjCsmdpWJjELmQipCRgQMPVAz, base: None } already in use
Program 11111111111111111111111111111111 failed: custom program error: 0x0
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW consumed 10282 of 200000 compute units
Program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW failed: custom program error: 0x0
```
### dan_claim
- signature: `2Upc5RPjFr9xkjW9CeMcJ5nwVSuq5GkqmeKrQvJ6UUvrdekssfwrjyhYKwhTP8tWcUDBLHup7RwfPzGa4JtURcmR`
- explorer: https://explorer.solana.com/tx/2Upc5RPjFr9xkjW9CeMcJ5nwVSuq5GkqmeKrQvJ6UUvrdekssfwrjyhYKwhTP8tWcUDBLHup7RwfPzGa4JtURcmR?cluster=devnet

## Checks
- claimed_amount = 10000
- maya = 5000, dan = 5000, vault = 0
- vault + claimed = 0 + 10000 = 10000 (funded = 10000)
- matrix: pass=15 fail=0
