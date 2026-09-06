import { EthChainId } from "@sentio/sdk/eth";
import { Id, MorphoVaultConfig } from "./types.js";
import {
  BASE_TOKENS,
  HYPER_EVM_TOKENS,
  MAINNET_TOKENS,
} from "@swell-network/swentio-utils/dist/shared/tokens.js";
import {
  BASE_TOKEN_ADDRESSES,
  MAINNET_TOKEN_ADDRESSES,
  HYPEREVM_TRACK_VAULTS,
} from "@swell-network/swentio-utils/dist/shared/constants.js";

export const configs: Record<Id, MorphoVaultConfig> = {
  morpho_999_v2: {
    network: EthChainId.HYPER_EVM,
    protocol: "Morpho",
    morphoBlue: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    // startBlock: 76531,
    morphoStartBlock: 1988429,
    startBlock: 1988429, // morpho start
    // startBlock: 6271281, // starting from feHYPE deployment
    // startBlock: 9855743, // starting from hwHYPE deployment
    whitelistedAssets: [
      HYPER_EVM_TOKENS.WHYPE,
      HYPER_EVM_TOKENS.USDE,
      HYPER_EVM_TOKENS.USDT0,
      HYPER_EVM_TOKENS.USDHL,
      HYPER_EVM_TOKENS.USDC,
      HYPER_EVM_TOKENS.USDE,
      HYPER_EVM_TOKENS.USR,
    ],
    whitelistedAddresses: HYPEREVM_TRACK_VAULTS,
  },
  morpho_1_v2: {
    network: EthChainId.ETHEREUM,
    protocol: "Morpho",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    morphoStartBlock: 18883124,
    // startBlock: 76531,
    startBlock: 23433451, // starting from hwUSD deployment
    whitelistedAssets: [
      MAINNET_TOKENS.USDC,
      MAINNET_TOKENS.USDT,
      MAINNET_TOKENS.USDE,
    ],
    whitelistedAddresses: [MAINNET_TOKEN_ADDRESSES.HWUSD],
  },
  morpho_8453_v2: {
    network: EthChainId.BASE,
    protocol: "Morpho",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    metaMorphoFactory: "0xFf62A7c278C62eD665133147129245053Bbf5918",
    morphoStartBlock: 13977148,
    // startBlock: 76531,
    startBlock: 35972908, // starting from hwUSD deployment
    whitelistedAssets: [BASE_TOKENS.USDE, BASE_TOKENS.USDC],
    whitelistedAddresses: [BASE_TOKEN_ADDRESSES.HWUSD],
  },
};
