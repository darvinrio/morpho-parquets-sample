import { EthChainId } from "@sentio/sdk/eth";
import { Token } from "@uniswap/sdk-core";

export interface MorphoVaultConfig {
  network: EthChainId;
  protocol: string;
  morphoStartBlock: number;
  morphoBlue: string;
  metaMorphoFactory: string;
  startBlock: number;
  whitelistedAssets: Token[];
  // whitelistedVaults: MetaVault[];
  whitelistedAddresses?: string[];
}

export type Id = "morpho_999_v2" | "morpho_1_v2" | "morpho_8453_v2";

export interface MetaVault {
  vault: string;
  underlying: Token;
  startBlock: number;
  vaultName: string;
}
