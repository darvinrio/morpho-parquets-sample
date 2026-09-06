import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { EthContext, isNullAddress } from "@sentio/sdk/eth";
import { getUsdExchangeRate } from "@swell-network/swentio-utils/dist/prices/price.js";
import { getAPR } from "@swell-network/swentio-utils/dist/apr/apr.js";
import { bigD2Num } from "@swell-network/swentio-utils/dist/apr/utils.js";
import { sumAprOutputArray } from "@swell-network/swentio-utils/dist/apr/sum.js";
import { AprOutput } from "@swell-network/swentio-utils/dist/apr/types.js";
import {
  getMetaMorphoContractOnContext,
  MetaMorphoProcessor,
  MetaMorphoProcessorTemplate,
} from "./types/eth/metamorpho.js";
import { MetaVault } from "./types.js";
import {
  getMorphoContractOnContext,
  MorphoProcessor,
} from "./types/eth/morpho.js";
import { BigDecimal } from "@sentio/sdk";
import { getAdaptiveCurveIrmContractOnContext } from "./types/eth/adaptivecurveirm.js";
import { wTaylorCompounded } from "./morphoUtils.js";
import { MetaMorphoFactoryProcessor } from "./types/eth/metamorphofactory.js";

const config = configs[deploymentID];
const vaultType = "MetaMorpho";

MorphoProcessor.bind({
  address: config.morphoBlue,
  network: config.network,
  startBlock: config.startBlock,
}).onTimeInterval(
  async (_, ctx) => {
    const activeTokens = config.whitelistedVaults.filter(
      (metaVault) => ctx.blockNumber >= metaVault.startBlock
    );
    const logPromises = activeTokens.map((metaVault) =>
      logRates(ctx, metaVault)
    );
    await Promise.all(logPromises);
  },
  30, // 30 mins post back fill
  4 * 60
);

const transferFilters = config.whitelistedAddresses?.flatMap((v) => [
  MetaMorphoProcessor.filters.Transfer(v),
  MetaMorphoProcessor.filters.Transfer(null, v),
]);
const metaMorphoTemplate = new MetaMorphoProcessorTemplate().onEventTransfer(
  async (event, ctx) => {
    const { from, to, value } = event.args;
    if (
      config.whitelistedAddresses?.includes(from) ||
      config.whitelistedAddresses?.includes(to)
    ) {
      const metaVault = config.whitelistedVaults.find(
        (v) => v.vault === ctx.address
      );
      if (metaVault) await logRates(ctx, metaVault);
    }
  },
  transferFilters
);

const metaMorphoFilters = config.whitelistedVaults.map((v) =>
  MetaMorphoFactoryProcessor.filters.CreateMetaMorpho(v.vault)
);
MetaMorphoFactoryProcessor.bind({
  address: config.metaMorphoFactory,
  network: config.network,
  // startBlock: config.startBlock,
}).onEventCreateMetaMorpho(async (event, ctx) => {
  const { metaMorpho, asset, name, symbol } = event.args;
  if (!config.whitelistedVaults.find((v) => v.vault === metaMorpho)) {
    return;
  }
  metaMorphoTemplate.bind(
    {
      address: metaMorpho,
      startBlock: ctx.blockNumber,
    },
    ctx
  );
}, metaMorphoFilters);

async function logRates(ctx: EthContext, metaVault: MetaVault) {
  const eventName = "TimeInterval";
  const now = BigInt(ctx.timestamp.getTime() / 1000);
  const metaVaultContract = getMetaMorphoContractOnContext(
    ctx,
    metaVault.vault
  );
  const shareDecimals = 18n + 6n;
  const vaultDecimals = 18n;
  const [supply, usdPrice, sharesToAssets, underlyingApr] = await Promise.all([
    metaVaultContract.totalSupply(),
    getUsdExchangeRate(ctx, metaVault.underlying),
    metaVaultContract.convertToAssets(10n ** vaultDecimals),
    getAPR(ctx, metaVault.underlying),
  ]);

  const currentRate = sharesToAssets.scaleDown(metaVault.underlying.decimals);
  const usdSupply = supply
    .scaleDown(vaultDecimals)
    .times(currentRate)
    .times(usdPrice);
  const supplyAprBreakdown: AprOutput[] = usdSupply.eq(0)
    ? []
    : await getMetaVaultApr(ctx, metaVault, usdPrice, usdSupply);

  const aprBreakdown: AprOutput[] = [
    ...supplyAprBreakdown,
    {
      aprType: "SINGLE" as const,
      apr: bigD2Num(underlyingApr),
      aprMetadata: metaVault.underlying.symbol ?? "",
    },
  ].filter((item) => item.apr !== 0);
  const aprTotal = sumAprOutputArray(aprBreakdown);

  const vaultName = config.protocol + " " + metaVault.vaultName;
  const protocolId =
    config.protocol.toLowerCase() +
    "_" +
    metaVault.vaultName.toLowerCase() +
    "_" +
    ctx.chainId;

  ctx.eventLogger.emit("yieldAPR", {
    protocol_id: protocolId,
    vaultType: vaultType,
    vaultName: vaultName,
    vaultAddress: metaVault.vault,
    oracleAddress: config.morphoBlue,
    eventName: eventName,
    lastUpdatedAt: Number(now),
    lastApr: aprTotal.apr,
    lastRate: currentRate,
    supply: supply,
    usdSupply: usdSupply,
    aprBreakdown: JSON.stringify(aprBreakdown),
    aprTotal: JSON.stringify(aprTotal),
  });

  const balancePromises = config.whitelistedAddresses
    ? config.whitelistedAddresses.map((address) => {
        return metaVaultContract.balanceOf(address);
      })
    : [];
  const balances = await Promise.all(balancePromises);

  balances.map((balance, index) => {
    if (balance === 0n) {
      return;
    }
    const balanceScaled = balance.scaleDown(vaultDecimals);
    const usdBalance = balanceScaled.times(currentRate).times(usdPrice);
    ctx.eventLogger.emit("yieldBalance", {
      protocol_id: protocolId,
      vaultType: vaultType,
      vaultName: vaultName,
      vaultAddress: metaVault.vault,
      eventName: eventName,
      account: config.whitelistedAddresses?.[index] || "unknown",
      balance: balanceScaled,
      balanceUsd: usdBalance,
      lastUpdatedAt: Number(now),
      lastRate: currentRate,
      lastApr: aprTotal.apr,
      aprBreakdown: JSON.stringify(aprBreakdown),
      aprTotal: JSON.stringify(aprTotal),
    });
  });
}

async function getMetaVaultApr(
  ctx: EthContext,
  metaVault: MetaVault,
  underlyingPrice: BigDecimal,
  usdSupply: BigDecimal
): Promise<AprOutput[]> {
  const metaVaultContract = getMetaMorphoContractOnContext(
    ctx,
    metaVault.vault
  );
  const shareDecimals = BigInt(metaVault.underlying.decimals) + 6n;
  const assetDecimals = BigInt(metaVault.underlying.decimals);
  const vaultDecimals = 18n;

  const marketsLength = await metaVaultContract.withdrawQueueLength();
  if (marketsLength === 0n) {
    return [];
  }
  const positions = await Promise.all(
    Array.from({ length: Number(marketsLength) }).map(async (_, i) => {
      const marketId = await metaVaultContract.withdrawQueue(i);
      const { supplyAPY, supplyBalance } = await getMorphoMarketPosition(
        ctx,
        marketId,
        assetDecimals,
        metaVault
      );
      return {
        marketId,
        supplyAPY: supplyAPY,
        supplyBalance: supplyBalance,
        usdBalance: supplyBalance.times(underlyingPrice),
      };
    })
  );

  ctx.eventLogger.emit("morpho_positions", {
    protocol_id: config.protocol,
    vault: metaVault.vault,
    positions: JSON.stringify(positions),
  });

  const aprBreakdown: AprOutput[] = positions.map((position) => {
    const scaledApr = position.supplyAPY
      .times(position.usdBalance)
      .div(usdSupply);
    return {
      aprType: "SINGLE" as const,
      apr: bigD2Num(scaledApr),
      aprMetadata: position.marketId,
    };
  });

  return aprBreakdown;
}

async function getMorphoMarketPosition(
  ctx: EthContext,
  marketId: string,
  assetDecimals: bigint,
  metaVault?: MetaVault
) {
  const shareDecimals = BigInt(assetDecimals) + 6n;
  const morphoBlueContract = getMorphoContractOnContext(ctx, config.morphoBlue);

  const [marketParams, marketState] = await Promise.all([
    morphoBlueContract.idToMarketParams(marketId),
    morphoBlueContract.market(marketId),
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
  const supplySharesScaled = BigInt(totalSupplyShares).scaleDown(shareDecimals);
  const borrowSharesScaled = BigInt(totalBorrowShares).scaleDown(shareDecimals);
  const totalSupply = BigInt(totalSupplyAssets).scaleDown(assetDecimals);
  const supplyToSharesRatio = supplySharesScaled.eq(0)
    ? BigDecimal(0)
    : totalSupply.div(supplySharesScaled);

  let borrowAPY = BigDecimal(0);
  let supplyAPY = BigDecimal(0);
  const utilization = supplySharesScaled.eq(0)
    ? BigDecimal(0)
    : borrowSharesScaled.div(supplySharesScaled);
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

  let supplyBalance = BigDecimal(0);
  if (metaVault) {
    const { supplyShares, borrowShares, collateral } =
      await morphoBlueContract.position(marketId, metaVault.vault);
    supplyBalance = supplyShares
      .scaleDown(shareDecimals)
      .times(supplyToSharesRatio);
  }

  return {
    supplyAPY: supplyAPY,
    supplyBalance: supplyBalance,
  };
}
