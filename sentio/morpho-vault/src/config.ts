import { EthChainId } from "@sentio/sdk/eth";
import { Id, ERCConfig } from "./types.js";
import { HYPER_EVM_TOKENS } from "@swell-network/swentio-utils/dist/shared/tokens.js";
import { HWHLP_CAMPAIGN } from "@swell-network/swentio-utils/dist/shared/points.js";

export const configs: Record<Id, ERCConfig> = {
  felix_vault_usdhl_999: {
    network: EthChainId.HYPER_EVM,
    decimals: 18,
    tokenAddress: "0x66c71204B70aE27BE6dC3eb41F9aF5868E68fDb6",
    startBlock: 7852829,
    morphoBlueAddress: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    marketId:
      "0xe500760b79e397869927a5275d64987325faae43326daf6be5a560184e30a521",
    supplyToken: HYPER_EVM_TOKENS.USDHL,
    // points: [],
    points: [
      HWHLP_CAMPAIGN(),
      HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
    ],
  },
  felix_vault_usdt0_999: {
    network: EthChainId.HYPER_EVM,
    decimals: 18,
    tokenAddress: "0x9896a8605763106e57A51aa0a97Fe8099E806bb3",
    startBlock: 8554473,
    morphoBlueAddress: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    marketId:
      "0x86d7bc359391486de8cd1204da45c53d6ada60ab9764450dc691e1775b2e8d69",
    supplyToken: HYPER_EVM_TOKENS.USDT0,
    // points: [],
    points: [
      HWHLP_CAMPAIGN(),
      HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
    ],
  },
  hystable_vault_usdt0_999: {
    network: EthChainId.HYPER_EVM,
    decimals: 18,
    tokenAddress: "0x16a9C065d05383D7e45824849B902331408d0dF6",
    startBlock: 9788338,
    morphoBlueAddress: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    marketId:
      "0xea220739ff9344028a3b2796ede5d2937820ef93d46134639e7676ff82918610",
    supplyToken: HYPER_EVM_TOKENS.USDT0,
    // points: [],
    points: [
      HWHLP_CAMPAIGN(),
      HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
    ],
  },
  hystable_vault_usde_999: {
    network: EthChainId.HYPER_EVM,
    decimals: 18,
    tokenAddress: "0x167d573aF30396815E9696D743E8128067C6b4ae",
    startBlock: 9797915,
    morphoBlueAddress: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    marketId:
      "0x4d28821656387b59b9af4fd98bcb794a894ede7ace017dc75e4ee73b8d8e8e49",
    supplyToken: HYPER_EVM_TOKENS.USDE,
    // points: [],
    points: [
      HWHLP_CAMPAIGN(),
      HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
    ],
  },
  hystable_vault_ush_999: {
    network: EthChainId.HYPER_EVM,
    decimals: 18,
    tokenAddress: "0x61F25b1B4235E0fFf2329037cf514c4F72c8E9fD",
    startBlock: 9716114,
    morphoBlueAddress: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    marketId:
      "0x2ebb6012132e0d5e5999072da8ee3df47f50347605b16bd86410312f66e522e2",
    supplyToken: HYPER_EVM_TOKENS.USH,
    gauge: {
      address: "0x22fC0C3B9c8305c4E82591858e170376A81e870C",
      startBlock: 9807797,
      rewardTokens: [HYPER_EVM_TOKENS.PEG],
    },
    // points: [],
    points: [
      HWHLP_CAMPAIGN(),
      HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
    ],
  },
};
