import { EthContext } from "@sentio/sdk/eth";
import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { getMorphoContractOnContext } from "./types/eth/morpho.js";
import { BigDecimal, LogLevel } from "@sentio/sdk";
import { morphoOracle, wTaylorCompounded } from "./morphoUtils.js";
import { getUsdExchangeRate } from "@swell-network/swentio-utils/dist/prices/price.js";
import { getAPR } from "@swell-network/swentio-utils/dist/apr/apr.js";
import { SingleAprOutput } from "@swell-network/swentio-utils/dist/apr/types.js";
import { AprMetaDataId } from "@swell-network/swentio-utils/dist/apr/metadata.js";
import { bigD2Num } from "@swell-network/swentio-utils/dist/apr/utils.js";
import { sumAprOutputArray } from "@swell-network/swentio-utils/dist/apr/sum.js";
import { MorphoState } from "./schema/schema.js";

const config = configs[deploymentID];
const assets = config.whitelistedAssets.map((asset) => asset.address);
const whitelistedAddresses = config.whitelistedAddresses ?? [];

export async function logOneAddressMarket(
  ctx: EthContext,
  eventName: string,
  marketId: string,
  address: string,
  marketState?: MorphoState
) {
  const morphoBlueContract = getMorphoContractOnContext(ctx, config.morphoBlue);
  const positions = await morphoBlueContract.position(marketId, address);
  const marketInfo =
    marketState ?? (await ctx.store.get(MorphoState, marketId));
  if (!marketInfo) {
    ctx.eventLogger.emit("missing_market_info", {
      marketId: marketId,
      severity: LogLevel.ERROR,
    });
    return;
  }
  const now = BigInt(ctx.timestamp.getTime() / 1000);

  const supplyBalance = positions.supplyShares
    .scaleDown(marketInfo.loanDecimals + 6n)
    .times(marketInfo.supplyToSharesRatio);
  const borrowBalance = positions.borrowShares
    .scaleDown(marketInfo.loanDecimals + 6n)
    .times(marketInfo.loanToSharesRatio);
  const collateralBalance = positions.collateral.scaleDown(
    marketInfo.collateralDecimals
  );

  const supplyUsd = supplyBalance.times(marketInfo.loanUsdPrice);
  const borrowUsd = borrowBalance.times(marketInfo.loanUsdPrice);
  const collateralUsd = collateralBalance.times(marketInfo.collateralUsdPrice);

  const supplyApr = marketInfo.supplyApy;
  const borrowApr = marketInfo.borrowApy;
  const collateralApr = marketInfo.collateralUnderlyingApr;
  const underlyingApr = marketInfo.loanUnderlyingApr;

  const supplyRate = marketInfo.supplyToSharesRatio;
  const borrowRate = marketInfo.loanToSharesRatio;
  const collateralRate = BigDecimal(1); // No rate change for collateral

  // Define position types for the loop
  const positionTypes = [
    {
      type: "supply",
      balance: supplyBalance,
      balanceUsd: supplyUsd,
      apr: supplyApr.plus(underlyingApr),
      rate: supplyRate,
      protocolId: `${marketInfo.protocolId}_supply`,
      vaultName: `${marketInfo.vaultName} Supply`,
    },
    {
      type: "borrow",
      balance: borrowBalance.negated(),
      balanceUsd: borrowUsd.negated(),
      apr: borrowApr.plus(underlyingApr).negated(),
      rate: borrowRate,
      protocolId: `${marketInfo.protocolId}_borrow`,
      vaultName: `${marketInfo.vaultName} Borrow`,
    },
    {
      type: "collateral",
      balance: collateralBalance,
      balanceUsd: collateralUsd,
      apr: collateralApr,
      rate: collateralRate,
      protocolId: `${marketInfo.protocolId}_collateral`,
      vaultName: `${marketInfo.vaultName} ${marketInfo.collateralSymbol} Collateral`,
    },
  ];

  // Loop through each position type and log
  for (const position of positionTypes) {
    // Only log positions with non-zero balances (positive for supply/collateral, negative for borrow)
    if (!position.balance.eq(0)) {
      ctx.eventLogger.emit("yieldBalance", {
        protocol_id: position.protocolId,
        vaultType: "MorphoMarket",
        vaultName: position.vaultName,
        vaultAddress: config.morphoBlue,
        eventName: eventName,
        account: address,
        balance: position.balance,
        balanceUsd: position.balanceUsd,
        lastUpdatedAt: Number(now),
        lastApr: position.apr,
        lastRate: position.rate,
        aprBreakdown: JSON.stringify([]),
        aprTotal: JSON.stringify([]),
        positionType: position.type, // Additional field to identify position type
      });
    }
  }
}

export async function logMarketRates(
  ctx: EthContext,
  eventName: string,
  marketId: string,
  borrowRate: bigint
) {
  const now = BigInt(ctx.timestamp.getTime() / 1000);
  const morphoBlueContract = getMorphoContractOnContext(ctx, config.morphoBlue);
  const morphoState = await ctx.store.get(MorphoState, marketId);
  if (!morphoState) {
    return;
  }
  const [marketState] = await Promise.all([
    morphoBlueContract.market(marketId),
  ]);
  const {
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
    lastUpdate,
    fee,
  } = marketState;

  const { loanDecimals, loanAsset, loanSymbol } = morphoState;

  const totalBorrow = BigInt(totalBorrowAssets).scaleDown(loanDecimals);
  const totalSupply = BigInt(totalSupplyAssets).scaleDown(loanDecimals);
  const borrowShares = BigInt(totalBorrowShares).scaleDown(loanDecimals + 6n);
  const supplyShares = BigInt(totalSupplyShares).scaleDown(loanDecimals + 6n);

  const loanToSharesRatio = borrowShares.eq(0)
    ? BigDecimal(0)
    : totalBorrow.div(borrowShares);
  const supplyToSharesRatio = supplyShares.eq(0)
    ? BigDecimal(0)
    : totalSupply.div(supplyShares);
  const utilization = supplyShares.eq(0)
    ? BigDecimal(0)
    : borrowShares.div(supplyShares);
  const feeScaled = fee.scaleDown(18);

  const borrowAPY = wTaylorCompounded(borrowRate, BigInt(365 * 24 * 60 * 60))
    .scaleDown(18)
    .times(100);
  const supplyAPY = borrowAPY
    .times(utilization)
    .times(BigDecimal(1).minus(feeScaled));

  const usdPrice = await getUsdExchangeRate(ctx, loanAsset);
  const collateralUsdPrice = await getUsdExchangeRate(
    ctx,
    morphoState.collateralAsset
  )
    .catch(
      async () =>
        await morphoOracle(ctx, morphoState.collateralOracle, usdPrice)
    )
    .catch(() => {
      ctx.eventLogger.emit("MorphoOracleError", {
        message: "Morpho oracle address is zero address",
        loglevel: LogLevel.WARNING,
      });
      return usdPrice;
    });
  const underlyingApr = await getAPR(ctx, loanAsset, Number(loanDecimals));
  const collateralApr = await getAPR(
    ctx,
    morphoState.collateralAsset,
    Number(morphoState.collateralDecimals)
  ).catch(() => BigDecimal(0));

  const supplyAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE" as const,
      aprMetadata: AprMetaDataId.morpho_supply,
      apr: bigD2Num(supplyAPY),
    },
    {
      aprType: "SINGLE" as const,
      aprMetadata: loanSymbol ?? "",
      apr: bigD2Num(underlyingApr),
    },
  ].filter((item) => item.apr !== 0);
  const borrowAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE" as const,
      aprMetadata: AprMetaDataId.morpho_borrow,
      apr: bigD2Num(borrowAPY.negated()),
    },
    {
      aprType: "SINGLE" as const,
      aprMetadata: loanSymbol ?? "",
      apr: bigD2Num(underlyingApr.negated()),
    },
  ].filter((item) => item.apr !== 0);
  const collateralAprs: SingleAprOutput[] = [
    {
      aprType: "SINGLE" as const,
      aprMetadata: AprMetaDataId.morpho_collateral,
      apr: bigD2Num(collateralApr),
    },
  ].filter((item) => item.apr !== 0);

  ctx.eventLogger.emit("yieldAPR", {
    protocol_id: morphoState.protocolId,
    vaultType: "MorphoMarket",
    vaultName: morphoState.vaultName,
    vaultAddress: config.morphoBlue,
    oracleAddress: config.morphoBlue,
    eventName: eventName,
    lastUpdatedAt: Number(now),
    lastApr: supplyAPY,
    lastRate: supplyToSharesRatio,
    supply: totalSupply,
    usdSupply: totalSupply.times(usdPrice),
    aprBreakdown: JSON.stringify(supplyAprs),
    aprTotal: JSON.stringify(sumAprOutputArray(supplyAprs)),

    // Additional fields for Morpho UI
    debt: totalBorrow,
    borrowSharePrice: loanToSharesRatio,
    supplySharePrice: supplyToSharesRatio,
    underlyingSharePrice: BigDecimal(1),
    borrowAprBreakdown: JSON.stringify(borrowAprs),
    borrowAprTotal: JSON.stringify(sumAprOutputArray(borrowAprs)),
    collateralAprBreakdown: JSON.stringify(collateralAprs),
    collateralAprTotal: JSON.stringify(sumAprOutputArray(collateralAprs)),
  });

  const newMorphoState = new MorphoState({
    id: marketId,
    updatedAt: now,
    vaultName: morphoState.vaultName,
    protocolId: morphoState.protocolId,
    collateralAsset: morphoState.collateralAsset,
    collateralDecimals: morphoState.collateralDecimals,
    collateralSymbol: morphoState.collateralSymbol,
    collateralOracle: morphoState.collateralOracle,
    loanAsset: morphoState.loanAsset,
    loanDecimals: morphoState.loanDecimals,
    loanSymbol: morphoState.loanSymbol,
    collateralUsdPrice: collateralUsdPrice,
    loanUsdPrice: usdPrice,
    collateralUnderlyingApr: collateralApr,
    loanUnderlyingApr: underlyingApr,
    supplyApy: supplyAPY,
    borrowApy: borrowAPY,
    loanToSharesRatio: loanToSharesRatio,
    supplyToSharesRatio: supplyToSharesRatio,
    borrowRate: borrowRate,
  });
  await ctx.store.upsert(newMorphoState);
}

export async function logAllMarketRates(ctx: EthContext, eventName: string) {
  const states = await ctx.store.list(MorphoState);
  await Promise.all(
    states.map(async (state) => {
      await logMarketRates(
        ctx,
        eventName,
        state.id as string,
        state.borrowRate
      );
    })
  );
}

export async function logAllAddressMarkets(
  ctx: EthContext,
  eventName: string,
  addresses: string[]
) {
  const states = await ctx.store.list(MorphoState);

  // Loop through all market states
  for (const state of states) {
    const marketId = state.id as string;

    // Loop through all provided addresses
    for (const address of addresses) {
      try {
        await logOneAddressMarket(ctx, eventName, marketId, address, state);

        // Log summary information for this market-address combination
        // ctx.eventLogger.emit("morpho_position_summary", {
        //   marketId: marketId,
        //   address: address,
        //   vaultName: state.vaultName,
        //   protocolId: state.protocolId,
        //   collateralSymbol: state.collateralSymbol,
        //   loanSymbol: state.loanSymbol,
        //   timestamp: Number(BigInt(ctx.timestamp.getTime() / 1000)),
        // });
      } catch (error) {
        ctx.eventLogger.emit("morpho_position_error", {
          marketId: marketId,
          address: address,
          error: error instanceof Error ? error.message : String(error),
          severity: LogLevel.WARNING,
        });
      }
    }
  }
}

export async function logSpecificMarketPositions(
  ctx: EthContext,
  eventName: string,
  marketInfo: MorphoState,
  addresses: string[] = whitelistedAddresses
) {
  if (addresses.length === 0) {
    return;
  }
  const marketId = marketInfo.id as string;

  // Log market info
  ctx.eventLogger.emit("morpho_market_info", {
    marketId: marketId,
    protocolId: marketInfo.protocolId,
    vaultName: marketInfo.vaultName,
    collateralAsset: marketInfo.collateralAsset,
    collateralSymbol: marketInfo.collateralSymbol,
    loanAsset: marketInfo.loanAsset,
    loanSymbol: marketInfo.loanSymbol,
    supplyApy: marketInfo.supplyApy,
    borrowApy: marketInfo.borrowApy,
    timestamp: Number(marketInfo.updatedAt),
  });

  // Loop through all addresses for this specific market
  for (const address of addresses) {
    await logOneAddressMarket(ctx, eventName, marketId, address);
  }
}
