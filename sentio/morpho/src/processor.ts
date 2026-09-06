import { GLOBAL_CONFIG } from "@sentio/runtime";
import { isNullAddress } from "@sentio/sdk/eth";
import { BigDecimal } from "@sentio/sdk";

import { deploymentID } from "./deployment.js";
import { configs } from "./config.js";
import {
  AccrueInterestEvent,
  MorphoContext,
  MorphoProcessor,
} from "./types/eth/morpho.js";
import { MorphoState, PositionState, PositionType } from "./schema/schema.js";
import { getProtocolState } from "./state.js";
import {
  BalanceOutput,
  PointOutput,
  TokenConfig,
} from "@swell-network/swentio-utils/dist/shared/types.js";
import { groupAndSumPoints } from "@swell-network/swentio-utils/dist/shared/utils.js";

const config = configs[deploymentID];

GLOBAL_CONFIG.execution = {
  sequential: true,
  forceExactBlockTime: true,
};

const morphoBorrowFilter = MorphoProcessor.filters.Borrow(config.marketId);
const morphoSupplyFilter = MorphoProcessor.filters.Supply(config.marketId);
const morphoWithdrawFilter = MorphoProcessor.filters.Withdraw(config.marketId);
const morphoRepayFilter = MorphoProcessor.filters.Repay(config.marketId);
const morphoSupplyCollateralFilter = MorphoProcessor.filters.SupplyCollateral(
  config.marketId
);
const morphoWithdrawCollateralFilter =
  MorphoProcessor.filters.WithdrawCollateral(config.marketId);
const morphoLiquidateFilter = MorphoProcessor.filters.Liquidate(
  config.marketId
);
const morphoAccrueInterestFilter = MorphoProcessor.filters.AccrueInterest(
  config.marketId
);
// const morphoBorrowFilter = MorphoProcessor.filters.Borrow(config.marketId)

MorphoProcessor.bind({
  address: config.vault,
  startBlock: config.startBlock,
  network: config.network,
})
  .onEventBorrow(async (event, ctx) => {
    const { assets, shares, caller, onBehalf, receiver, id } = event.args;
    const poolState = await getProtocolState(ctx, 0n, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Borrow,
      shares,
      event.name
    );
  }, morphoBorrowFilter)
  .onEventSupply(async (event, ctx) => {
    const { assets, shares, caller, onBehalf, id } = event.args;
    const poolState = await getProtocolState(ctx, 0n, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Supply,
      shares,
      event.name
    );
  }, morphoSupplyFilter)
  .onEventWithdraw(async (event, ctx) => {
    const { assets, shares, caller, onBehalf, receiver, id } = event.args;
    const poolState = await getProtocolState(ctx, 0n, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Supply,
      -shares,
      event.name
    );
  }, morphoWithdrawFilter)
  .onEventRepay(async (event, ctx) => {
    const { assets, shares, caller, onBehalf, id } = event.args;
    const poolState = await getProtocolState(ctx, 0n, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Borrow,
      -shares,
      event.name
    );
  }, morphoRepayFilter)
  .onEventSupplyCollateral(async (event, ctx) => {
    const { assets, caller, onBehalf, id } = event.args;
    const poolState = await getProtocolState(ctx, assets, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Collateral,
      assets,
      event.name
    );
  }, morphoSupplyCollateralFilter)
  .onEventWithdrawCollateral(async (event, ctx) => {
    const { assets, caller, onBehalf, receiver, id } = event.args;
    const poolState = await getProtocolState(ctx, -assets, event.name);
    await updateOne(
      ctx,
      poolState,
      onBehalf,
      PositionType.Collateral,
      -assets,
      event.name
    );
  }, morphoWithdrawCollateralFilter)
  .onEventLiquidate(async (event, ctx) => {
    const {
      id,
      caller,
      borrower,
      repaidAssets,
      repaidShares,
      seizedAssets,
      badDebtAssets,
      badDebtShares,
    } = event.args;
    const poolState = await getProtocolState(ctx, -seizedAssets, event.name);
    await updateOne(
      ctx,
      poolState,
      borrower,
      PositionType.Borrow,
      -repaidShares,
      event.name
    );
    await updateOne(
      ctx,
      poolState,
      borrower,
      PositionType.Collateral,
      -seizedAssets,
      event.name
    );
  }, morphoLiquidateFilter)
  .onEventAccrueInterest(handleAccrueInterestEvent, morphoAccrueInterestFilter)
  .onTimeInterval((_, ctx) => updateAll(ctx, "TimeInterval"), 4 * 60, 4 * 60);

async function handleAccrueInterestEvent(
  event: AccrueInterestEvent,
  ctx: MorphoContext
) {
  if (event.args.id === config.marketId) {
    await updateAll(ctx, event.name);
  }
}

async function updateAll(ctx: MorphoContext, triggerEvent: string) {
  const poolState = await getProtocolState(ctx, 0n, triggerEvent);
  const positions = await ctx.store.list(PositionState);
  let newPositions: PositionState[] = [];
  positions.map(async (position) => {
    const newposition = new PositionState({
      id: position.id,
      address: position.address,
      type: position.type,
      updatedAt: BigInt(ctx.timestamp.getTime()),
      balance: position.balance,
    });
    newPositions.push(newposition);
    processPosition(ctx, poolState, position, newposition, triggerEvent);
  });
  await Promise.all([ctx.store.upsert(newPositions)]);
}

async function updateOne(
  ctx: MorphoContext,
  poolState: MorphoState,
  address: string,
  positionType: PositionType,
  deltaAmount: bigint,
  triggerEvent: string
) {
  const id = address + "_" + positionType;
  let position = await ctx.store.get(PositionState, id);
  if (!position) {
    position = new PositionState({
      id: id,
      type: positionType,
      address: address,
      updatedAt: BigInt(ctx.timestamp.getTime()),
      balance: BigDecimal(0),
    });
  }

  const extraDecimals = positionType === PositionType.Collateral ? 0 : 6;
  const decimals =
    positionTypeToTokenConfig(positionType).token.decimals + extraDecimals;
  const balance = position.balance.plus(deltaAmount.scaleDown(decimals));

  const newPosition = new PositionState({
    id: id,
    address: address,
    type: positionType,
    updatedAt: BigInt(ctx.timestamp.getTime()),
    balance: balance,
  });

  processPosition(ctx, poolState, position, newPosition, triggerEvent);
  if (newPosition.balance.eq(0)) {
    await ctx.store.delete(PositionState, newPosition.id as string);
  } else {
    await ctx.store.upsert(newPosition);
  }
}

function processPosition(
  ctx: MorphoContext,
  poolState: MorphoState,
  oldPosition: PositionState,
  newPosition: PositionState,
  triggerEvent: string
) {
  const prevUpdatedAt = oldPosition.updatedAt;
  const newUpdatedAt = newPosition.updatedAt;
  const deltaSeconds = (newUpdatedAt - prevUpdatedAt) / 1000n;
  const hoursElapsed = deltaSeconds.asBigDecimal().div(3600);

  const rate = positionTypeToTokenRate(oldPosition.type, poolState);
  const oldTokenBalances = [oldPosition.balance.times(rate)];
  const newTokenBalances = [newPosition.balance.times(rate)];
  const pointMap = [positionTypeToTokenConfig(oldPosition.type).points];

  const points: PointOutput[] = oldTokenBalances.flatMap(
    (prevBalance, index) => {
      return pointMap[index].map((point) => {
        const {
          campaignId,
          pointId,
          startTimestamp,
          endTimestamp,
          baseRatePerHour,
          multiplier,
        } = point;

        const calcStartTimestamp =
          startTimestamp < prevUpdatedAt ? prevUpdatedAt : startTimestamp;
        const calcEndTimestamp =
          endTimestamp > newUpdatedAt ? newUpdatedAt : endTimestamp;
        const pointSeconds =
          calcEndTimestamp > calcStartTimestamp
            ? (calcEndTimestamp - calcStartTimestamp) / 1000n
            : 0n;
        const pointHours = pointSeconds.asBigDecimal().div(3600);

        const pointsEarned = prevBalance
          .times(pointHours)
          .times(baseRatePerHour)
          .times(multiplier);

        const pointSpeed = newTokenBalances[index]
          .times(baseRatePerHour)
          .times(multiplier)
          .div(3600); // convert 1 hour point to 1 second point

        return {
          campaignId,
          pointId,
          pointSeconds,
          pointsEarned,
          pointSpeed,
          calcStartTimestamp,
          calcEndTimestamp,
        };
      });
    }
  );

  const newBalanceUSD = newPosition.balance.times(
    positionTypeToTokenRate(oldPosition.type, poolState)
  );
  const balanceBreakdown: BalanceOutput[] = [];

  ctx.eventLogger.emit("account_snapshot", {
    id: oldPosition.id as string,
    account: oldPosition.address,
    sub_protocol_id: oldPosition.type,
    triggerEvent,
    points: JSON.stringify(groupAndSumPoints(points)),
    pointsBreakDown: JSON.stringify(points),
    prevBalance: oldPosition.balance,
    newBalance: newPosition.balance,
    prevUpdatedAt,
    newUpdatedAt,
    // balanceHours,
    // rate,
    newBalanceUSD: newBalanceUSD,
    newBalanceBreakDown: JSON.stringify(balanceBreakdown),
  });
}

function positionTypeToTokenRate(
  positionType: PositionType,
  poolState: MorphoState
): BigDecimal {
  switch (positionType) {
    case PositionType.Collateral:
      return BigDecimal(1);
    case PositionType.Supply:
      return poolState.supplyToSharesRatio;
    case PositionType.Borrow:
      return poolState.loanToSharesRatio;
    default:
      throw new Error(`Unknown position type: ${positionType}`);
  }
}

function positionTypeToTokenConfig(positionType: PositionType): TokenConfig {
  switch (positionType) {
    case PositionType.Collateral:
      return config.collateral;
    case PositionType.Supply:
      return config.supply;
    case PositionType.Borrow:
      return config.loan;
    default:
      throw new Error(`Unknown position type: ${positionType}`);
  }
}

function isProtocolAddress(address: string): boolean {
  return isNullAddress(address);
}
