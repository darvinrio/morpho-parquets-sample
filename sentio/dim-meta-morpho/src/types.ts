import { EthChainId } from "@sentio/sdk/eth";
import { Token } from "@uniswap/sdk-core";

export interface MorphoVaultConfig {
  network: EthChainId;
  protocol: string;
  morphoBlue: string;
  metaMorphoFactory: string;
  startBlock: number;
  whitelistedVaults: MetaVault[];
  whitelistedAddresses?: string[];
}

export type Id = "felix_999" | "morpho_1" | "morpho_8453";

export interface MetaVault {
  vault: string;
  underlying: Token;
  startBlock: number;
  vaultName: string;
}
