import { EthChainId } from "@sentio/sdk/eth";
import { BytesLike } from "ethers";
import {
  BorrowEvent,
  RepayEvent,
  SupplyCollateralEvent,
  SupplyEvent,
  WithdrawCollateralEvent,
  WithdrawEvent,
} from "./types/eth/morpho.js";
import { TokenConfig } from "@swell-network/swentio-utils/dist/shared/types.js";

export type Id =
  | "felix_hwhlp_usdhl_999"
  | "felix_hwhlp_usdt0_999"
  | "hystable_hwhlp_usdt0_999"
  | "hystable_hwhlp_usde_999"
  | "hystable_hwhlp_ush_999";

export interface MorphoConfig {
  network: EthChainId;
  vault: string;
  marketId: BytesLike;
  collateral: TokenConfig;
  supply: TokenConfig;
  loan: TokenConfig;
  startBlock: number;
}

export type MorphoUserEvent =
  | BorrowEvent
  | SupplyEvent
  | WithdrawEvent
  | RepayEvent
  | SupplyCollateralEvent
  | WithdrawCollateralEvent;
