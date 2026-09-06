import { ERC20Processor } from "@sentio/sdk/eth/builtin";
import { EthContext, isNullAddress } from "@sentio/sdk/eth";

import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { ERC20State } from "./types.js";
import { Account, PositionType } from "./schema/schema.js";
import { getProtocolState } from "./state.js";
import { getERC20ContractOnContext } from "@sentio/sdk/eth/builtin/erc20";
import { PointOutput } from "@swell-network/swentio-utils/dist/shared/types.js";
import { groupAndSumPoints } from "@swell-network/swentio-utils/dist/shared/utils.js";

const config = configs[deploymentID];

ERC20Processor.bind({
  address: config.tokenAddress,
  network: config.network,
  startBlock: config.startBlock,
})
  .onEventTransfer(async (event, ctx) => {
    const protocolState = await getProtocolState(ctx, "Transfer");
    const { from, to, value } = event.args;
    const promises = [];
    if (from === to) {
      processTransfer(ctx, protocolState, from, PositionType.LP);
      return;
    }
    if ([to, from].includes(config.gauge?.address ?? "")) {
      const addy = to === config.gauge?.address ? from : to;
      promises.push(processTransfer(ctx, protocolState, addy, PositionType.LP));
      promises.push(
        processTransfer(ctx, protocolState, addy, PositionType.GAUGE)
      );
    } else {
      promises.push(processTransfer(ctx, protocolState, from, PositionType.LP));
      promises.push(processTransfer(ctx, protocolState, to, PositionType.LP));
    }
    await Promise.all(promises);
  })
  .onTimeInterval(
    async (_, ctx) => {
      await updateAllAccounts(ctx, "TimeInterval");
    },
    4 * 60,
    4 * 60
  );

async function updateAllAccounts(ctx: EthContext, triggerEvent: string) {
  const accounts = await ctx.store.list(Account);
  let newAccounts: Account[] = [];
  let accountUpdatePromises: Promise<void>[] = [];
  const protocolState = await getProtocolState(ctx, triggerEvent);
  accounts.map(async (account) => {
    const newAccount = new Account({
      id: account.id,
      address: account.address,
      type: account.type,
      updatedAt: BigInt(ctx.timestamp.getTime()),
      balance: account.balance,
    });
    newAccounts.push(newAccount);
    accountUpdatePromises.push(
      processAccount(ctx, protocolState, account, newAccount, triggerEvent)
    );
  });
  await Promise.all([...accountUpdatePromises, ctx.store.upsert(newAccounts)]);
}

async function processTransfer(
  ctx: EthContext,
  protocolState: ERC20State,
  address: string,
  positionType: PositionType
) {
  if (isProtocolAddress(address)) {
    return;
  }
  const id = address + "_" + positionType;
  let account = await ctx.store.get(Account, id);
  if (!account) {
    account = new Account({
      id: id,
      address: address,
      type: positionType,
      updatedAt: BigInt(ctx.timestamp.getTime()),
      balance: 0n,
    });
  }
  const tokenAddress =
    config.gauge && positionType === PositionType.GAUGE
      ? config.gauge.address
      : config.tokenAddress;
  const newBalance = await getERC20ContractOnContext(
    ctx,
    tokenAddress
  ).balanceOf(address);
  const newAccount = new Account({
    id: account.id,
    address: account.address,
    type: account.type,
    updatedAt: BigInt(ctx.timestamp.getTime()),
    balance: newBalance,
  });
  if (newAccount.balance === 0n) {
    await ctx.store.delete(Account, account.id as string);
  } else {
    await ctx.store.upsert(newAccount);
  }

  await processAccount(ctx, protocolState, account, newAccount, "Transfer");
}

async function processAccount(
  ctx: EthContext,
  protocolState: ERC20State,
  oldAccount: Account,
  newAccount: Account,
  triggerEvent: string
) {
  const prevUpdatedAt = oldAccount.updatedAt;
  const prevBalance = oldAccount.balance.scaleDown(config.decimals);

  const newUpdatedAt = newAccount.updatedAt;
  const newBalance = newAccount.balance.scaleDown(config.decimals);

  const deltaSeconds = (newUpdatedAt - prevUpdatedAt) / 1000n;
  const hoursElapsed = deltaSeconds.asBigDecimal().div(3600);
  const balanceHours = prevBalance.times(hoursElapsed);

  const points: PointOutput[] = config.points.map((point) => {
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

    const pointSpeed = newBalance
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

  const newBalanceUSD = newBalance.times(protocolState.usdPrice);

  ctx.eventLogger.emit("account_snapshot", {
    id: oldAccount.id as string,
    account: oldAccount.address,
    sub_protocol_id: oldAccount.type,
    triggerEvent,
    points: JSON.stringify(groupAndSumPoints(points)),
    pointsBreakDown: JSON.stringify(points),
    prevBalance,
    newBalance,
    prevUpdatedAt,
    newUpdatedAt,
    balanceHours,
    newBalanceUSD,
  });
}

function isProtocolAddress(address: string): boolean {
  return isNullAddress(address) || address === config.gauge?.address;
}
