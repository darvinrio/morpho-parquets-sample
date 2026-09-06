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
  felix_999: {
    network: EthChainId.HYPER_EVM,
    protocol: "Felix",
    morphoBlue: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    // startBlock: 76531,
    // startBlock: 6271281, // starting from feHYPE deployment
    startBlock: 9855743, // starting from hwHYPE deployment
    whitelistedVaults: [
      {
        // hyHYPE
        vault: "0x2900ABd73631b2f60747e687095537B673c06A76",
        vaultName: "feHYPE",
        underlying: HYPER_EVM_TOKENS.WHYPE,
        startBlock: 6271281,
      },
      {
        // feUSDC
        vault: "0x8A862fD6c12f9ad34C9c2ff45AB2b6712e8CEa27",
        vaultName: "feUSDC",
        underlying: HYPER_EVM_TOKENS.USDC,
        startBlock: 13660573,
      },
      {
        // feUSDE
        vault: "0x835FEBF893c6DdDee5CF762B0f8e31C5B06938ab",
        vaultName: "feUSDE",
        underlying: HYPER_EVM_TOKENS.USDE,
        startBlock: 3450891,
      },
      {
        // feUSDT0
        vault: "0xFc5126377F0efc0041C0969Ef9BA903Ce67d151e",
        vaultName: "feUSDT0",
        underlying: HYPER_EVM_TOKENS.USDT0,
        startBlock: 3587074,
      },
    ],
    whitelistedAddresses: HYPEREVM_TRACK_VAULTS,
  },
  morpho_1: {
    network: EthChainId.ETHEREUM,
    protocol: "Morpho",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    metaMorphoFactory: "0xec051b19d654C48c357dC974376DeB6272f24e53",
    startBlock: 23433451, // starting from hwUSD deployment
    whitelistedVaults: [
      {
        // steakhouse USDT
        vault: "0xbEef047a543E45807105E51A8BBEFCc5950fcfBa",
        vaultName: "steakhouseUSDT",
        underlying: MAINNET_TOKENS.USDT,
        startBlock: 19043398,
      },
      {
        // steakhouse USDC
        vault: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
        vaultName: "steakhouseUSDC",
        underlying: MAINNET_TOKENS.USDC,
        startBlock: 18928285,
      },
      {
        // MeV capital USDC
        vault: "0xd63070114470f685b75B74D60EEc7c1113d33a3D",
        vaultName: "mevCapUSDC",
        underlying: MAINNET_TOKENS.USDC,
        startBlock: 20377233,
      },
      {
        // SmokeHouse USDC
        vault: "0xBEeFFF209270748ddd194831b3fa287a5386f5bC",
        vaultName: "smokeHouseUSDC",
        underlying: MAINNET_TOKENS.USDC,
        startBlock: 21337719,
      },
    ],
    whitelistedAddresses: [MAINNET_TOKEN_ADDRESSES.HWUSD],
  },
  morpho_8453: {
    network: EthChainId.BASE,
    protocol: "Morpho",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    metaMorphoFactory: "0xFf62A7c278C62eD665133147129245053Bbf5918",
    startBlock: 35972908, // starting from hwUSD deployment
    whitelistedVaults: [
      {
        // spark usdc
        vault: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A",
        vaultName: "sparkUSDC",
        underlying: BASE_TOKENS.USDC,
        startBlock: 24392934,
      },
      {
        // seamless usdc
        vault: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738",
        vaultName: "seamlessUSDC",
        underlying: BASE_TOKENS.USDC,
        startBlock: 24831748,
      },
    ],
    whitelistedAddresses: [BASE_TOKEN_ADDRESSES.HWUSD],
  },
};
