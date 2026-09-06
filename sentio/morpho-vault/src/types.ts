import { BigDecimal } from "@sentio/sdk";
import { EthChainId } from "@sentio/sdk/eth";
import { PointInfo } from "@swell-network/swentio-utils/dist/shared/types.js";
import { Token } from "@uniswap/sdk-core";
import { BytesLike } from "ethers";

export type Id =
  | "felix_vault_usdhl_999"
  | "felix_vault_usdt0_999"
  | "hystable_vault_usdt0_999"
  | "hystable_vault_usde_999"
  | "hystable_vault_ush_999";

export interface ERCConfig {
  network: EthChainId;
  tokenAddress: string;
  decimals: number;
  startBlock: number;
  points: PointInfo[];
  morphoBlueAddress: string;
  marketId: BytesLike;
  supplyToken: Token;
  gauge?: {
    address: string;
    startBlock: number;
    rewardTokens: Token[];
  };
}

// ERC20 State
export interface ERC20State {
  supply: BigDecimal;
  exchangeRate: BigDecimal;
  usdPrice: BigDecimal;
  // ethPrice: BigDecimal;
}
