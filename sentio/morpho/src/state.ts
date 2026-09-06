import { BigDecimal } from "@sentio/sdk";
import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { MorphoState, PositionType } from "./schema/schema.js";
import {
  getMorphoContractOnContext,
  MorphoContext,
} from "./types/eth/morpho.js";
import { isNullAddress } from "@sentio/sdk/eth";
import { getAdaptiveCurveIrmContractOnContext } from "./types/eth/adaptivecurveirm.js";
import { wTaylorCompounded } from "./morphoUtils.js";
import { BalanceOutput } from "@swell-network/swentio-utils/dist/shared/types.js";
import { AprMetaDataId } from "@swell-network/swentio-utils/dist/apr/metadata.js";
import { SingleAprOutput } from "@swell-network/swentio-utils/dist/apr/types.js";
import { bigD2Num } from "@swell-network/swentio-utils/dist/apr/utils.js";
import { getAPR } from "@swell-network/swentio-utils/dist/apr/apr.js";
import { sumAprOutputArray } from "@swell-network/swentio-utils/dist/apr/sum.js";

const config = configs[deploymentID];

export async function getProtocolState(
  ctx: MorphoContext,
  collateralDelta: bigint,
  triggerEvent: string = "Transfer"
): Promise<MorphoState> {
  const currentTimestamp = ctx.timestamp.getTime();

  const morphoBlue = getMorphoContractOnContext(ctx, config.vault);
  const [marketParams, marketState] = await Promise.all([
    morphoBlue.idToMarketParams(config.marketId),
    morphoBlue.market(config.marketId),
  ]);
  const [
    { loanToken, collateralToken, oracle, irm, lltv },
    {
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    },
  ] = [marketParams, marketState];

  const totalBorrow = BigInt(totalBorrowAssets).scaleDown(
    config.loan.token.decimals
  );
  const borrowBreakdown: BalanceOutput[] = [
    {
      token: config.loan.token.address,
      symbol: config.loan.token.symbol ?? "",
      native: totalBorrow,
      usd: totalBorrow,
    },
  ];
  const totalSupply = BigInt(totalSupplyAssets).scaleDown(
    config.loan.token.decimals
  );
  const supplyBreakdown: BalanceOutput[] = [
    {
      token: config.loan.token.address,
      symbol: config.loan.token.symbol ?? "",
      native: totalSupply,
      usd: totalSupply,
    },
  ];

  const borrowShares = BigInt(totalBorrowShares).scaleDown(
    config.loan.token.decimals + 6
  );
  const supplyShares = BigInt(totalSupplyShares).scaleDown(
    config.loan.token.decimals + 6
  );

  const loanToSharesRatio = totalBorrow.div(borrowShares);
  const supplyToSharesRatio = totalSupply.div(supplyShares);

  let borrowAPY = BigDecimal(0);
  let supplyAPY = BigDecimal(0);
  const utilization = borrowShares.div(supplyShares);
  const feeScaled = fee.scaleDown(18);
  try {
    const borrowRate = !isNullAddress(irm)
      ? await getAdaptiveCurveIrmContractOnContext(ctx, irm).borrowRateView(
          [...marketParams] as any,
          [...marketState] as any
        )
      : 0n;
    borrowAPY = wTaylorCompounded(borrowRate, BigInt(365 * 24 * 60 * 60))
      .scaleDown(18)
      .times(100);
    supplyAPY = borrowAPY
      .times(utilization)
      .times(BigDecimal(1).minus(feeScaled));
  } catch (e) {
    console.log("marketParams", marketParams);
    console.log("marketState", marketState);
    console.log("irm", irm);
    throw e;
  }

  const [collateralTokenApr, supplyTokenApr] = await Promise.all([
    getAPR(ctx, config.collateral),
    getAPR(ctx, config.supply),
  ]);

  const supplyAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE",
      aprMetadata: AprMetaDataId.morpho_supply,
      apr: bigD2Num(supplyAPY),
    },
    {
      aprType: "SINGLE",
      aprMetadata: config.supply.token.symbol ?? "",
      apr: bigD2Num(supplyTokenApr),
    },
  ];
  const borrowAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE",
      aprMetadata: AprMetaDataId.morpho_borrow,
      apr: bigD2Num(borrowAPY.negated()),
    },
    {
      aprType: "SINGLE",
      aprMetadata: config.loan.token.symbol ?? "",
      apr: bigD2Num(supplyTokenApr.negated()),
    },
  ];
  const collateralAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE",
      aprMetadata: config.collateral.token.symbol ?? "",
      apr: bigD2Num(collateralTokenApr),
    },
  ];

  let oldMorphoState = await ctx.store.get(MorphoState, "latest");
  if (!oldMorphoState) {
    oldMorphoState = new MorphoState({
      id: "latest",
      updatedAt: BigInt(currentTimestamp),
      supplyBalance: totalSupply,
      loanBalance: totalBorrow,
      collateralBalance: BigDecimal(0),
      loanToSharesRatio: loanToSharesRatio,
      supplyToSharesRatio: supplyToSharesRatio,
    });
  }
  const oldtotalCollateral = oldMorphoState.collateralBalance;
  const newtotalCollateral = oldtotalCollateral.plus(
    collateralDelta.scaleDown(config.collateral.token.decimals)
  );
  const collateralBreakdown: BalanceOutput[] = [
    {
      token: config.collateral.token.address,
      symbol: config.collateral.token.symbol ?? "",
      native: newtotalCollateral,
      usd: newtotalCollateral,
    },
  ];
  const newMorphoState = new MorphoState({
    id: "latest",
    updatedAt: BigInt(currentTimestamp),
    supplyBalance: totalSupply,
    loanBalance: totalBorrow,
    collateralBalance: newtotalCollateral,
    loanToSharesRatio: loanToSharesRatio,
    supplyToSharesRatio: supplyToSharesRatio,
  });
  await ctx.store.upsert(newMorphoState);

  ctx.eventLogger.emit("protocol_state", {
    triggerEvent,
    // protocol status
    sub_protocol_id: PositionType.Collateral,
    supply: newtotalCollateral,
    supplyBreakdown: JSON.stringify(collateralBreakdown),
    exchangeRate: BigDecimal(1),
    rateLastUpdatedAt: BigInt(currentTimestamp),
    apr: JSON.stringify(collateralAprs),
    aprTotal: JSON.stringify(sumAprOutputArray(collateralAprs)),
    // earnAPI
    supplyUsd: newtotalCollateral,
  });

  ctx.eventLogger.emit("protocol_state", {
    triggerEvent,
    // protocol status
    sub_protocol_id: PositionType.Borrow,
    supply: totalBorrow,
    supplyBreakdown: JSON.stringify(borrowBreakdown),
    exchangeRate: loanToSharesRatio,
    rateLastUpdatedAt: BigInt(currentTimestamp),
    aprBreakdown: JSON.stringify(borrowAprs),
    aprTotal: JSON.stringify(sumAprOutputArray(borrowAprs)),
    // earnAPI
    supplyUsd: totalBorrow,
  });

  ctx.eventLogger.emit("protocol_state", {
    triggerEvent,
    // protocol status
    sub_protocol_id: PositionType.Supply,
    supply: totalSupply,
    supplyBreakdown: JSON.stringify(supplyBreakdown),
    exchangeRate: supplyToSharesRatio,
    rateLastUpdatedAt: BigInt(currentTimestamp),
    aprBreakdown: JSON.stringify(supplyAprs),
    aprTotal: JSON.stringify(sumAprOutputArray(supplyAprs)),
    // earnAPI
    supplyUsd: totalSupply,
  });

  return newMorphoState;
}
