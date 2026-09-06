import { EthChainId } from "@sentio/sdk/eth";
import { Id, MorphoConfig } from "./types.js";
import {
  HWHLP_CAMPAIGN,
  HWHLP_INVARIANT,
} from "@swell-network/swentio-utils/dist/shared/points.js";
import { HYPER_EVM_TOKENS } from "@swell-network/swentio-utils/dist/shared/tokens.js";

export const configs: Record<Id, MorphoConfig> = {
  felix_hwhlp_usdhl_999: {
    // creation tx: https://purrsec.com/tx/0x5370ff97536fb9465b0a980e2dfea471b3d2d13d9a7cd6c850a9ffbacbf5bca3
    network: EthChainId.HYPER_EVM,
    vault: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    startBlock: 7852829,
    marketId:
      "0xe500760b79e397869927a5275d64987325faae43326daf6be5a560184e30a521",
    collateral: {
      token: HYPER_EVM_TOKENS.HWHLP,
      points: [HWHLP_INVARIANT, HWHLP_CAMPAIGN()],
    },
    supply: {
      token: HYPER_EVM_TOKENS.USDHL,
      points: [],
    },
    loan: {
      token: HYPER_EVM_TOKENS.USDHL,
      points: [
        HWHLP_CAMPAIGN(),
        HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
      ],
    },
  },
  felix_hwhlp_usdt0_999: {
    // https://purrsec.com/tx/0x3e670edf054ed72e30b1df8e488d3298763300800b1de6b0a8c481d5537096b7
    network: EthChainId.HYPER_EVM,
    vault: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    startBlock: 8553619,
    marketId:
      "0x86d7bc359391486de8cd1204da45c53d6ada60ab9764450dc691e1775b2e8d69",
    collateral: {
      token: HYPER_EVM_TOKENS.HWHLP,
      points: [HWHLP_INVARIANT, HWHLP_CAMPAIGN()],
    },
    supply: {
      token: HYPER_EVM_TOKENS.USDT0,
      points: [],
    },
    loan: {
      token: HYPER_EVM_TOKENS.USDT0,
      points: [
        HWHLP_CAMPAIGN(),
        HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
      ],
    },
  },
  hystable_hwhlp_usdt0_999: {
    // creation tx: https://purrsec.com/tx/0xea5db23f66bfc2769a649ee079cca55b42852e08c820117755922e9643e44ad4
    network: EthChainId.HYPER_EVM,
    vault: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    startBlock: 9788277,
    marketId:
      "0xea220739ff9344028a3b2796ede5d2937820ef93d46134639e7676ff82918610",
    collateral: {
      token: HYPER_EVM_TOKENS.HWHLP,
      points: [HWHLP_INVARIANT, HWHLP_CAMPAIGN()],
    },
    supply: {
      token: HYPER_EVM_TOKENS.USDT0,
      points: [],
    },
    loan: {
      token: HYPER_EVM_TOKENS.USDT0,
      points: [
        HWHLP_CAMPAIGN(),
        HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
      ],
    },
  },
  hystable_hwhlp_usde_999: {
    // creation tx: https://purrsec.com/tx/0x86f01ffdecd69a319e5bbac382b33fa55b5751a5081b4ccec566784cd6d77e38/logs
    network: EthChainId.HYPER_EVM,
    vault: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    startBlock: 9797854,
    marketId:
      "0x4d28821656387b59b9af4fd98bcb794a894ede7ace017dc75e4ee73b8d8e8e49",
    collateral: {
      token: HYPER_EVM_TOKENS.HWHLP,
      points: [HWHLP_INVARIANT, HWHLP_CAMPAIGN()],
    },
    supply: {
      token: HYPER_EVM_TOKENS.USDE,
      points: [],
    },
    loan: {
      token: HYPER_EVM_TOKENS.USDE,
      points: [
        HWHLP_CAMPAIGN(),
        HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
      ],
    },
  },
  hystable_hwhlp_ush_999: {
    // creation tx: https://purrsec.com/tx/0xc11cd3e533335101b4318b08212c4b1daab4d281719b96bc5e184ac02a9d64e6
    network: EthChainId.HYPER_EVM,
    vault: "0x68e37dE8d93d3496ae143F2E900490f6280C57cD",
    startBlock: 9715992,
    marketId:
      "0x2ebb6012132e0d5e5999072da8ee3df47f50347605b16bd86410312f66e522e2",
    collateral: {
      token: HYPER_EVM_TOKENS.HWHLP,
      points: [HWHLP_INVARIANT, HWHLP_CAMPAIGN()],
    },
    supply: {
      token: HYPER_EVM_TOKENS.USH,
      points: [],
    },
    loan: {
      token: HYPER_EVM_TOKENS.USH,
      points: [
        HWHLP_CAMPAIGN(),
        HWHLP_CAMPAIGN({ campaignId: "lp_campaign", multiplier: 1.5 }),
      ],
    },
  },
};
