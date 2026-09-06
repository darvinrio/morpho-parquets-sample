import { EthContext, isNullAddress } from "@sentio/sdk/eth";
import { BigDecimal } from "@sentio/sdk";
import { ERC20State } from "./types.js";
import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { getERC20ContractOnContext } from "@sentio/sdk/eth/builtin/erc20";
import { getMorphoContractOnContext } from "./types/eth/morpho.js";
import { getAdaptiveCurveIrmContractOnContext } from "./types/eth/adaptivecurveirm.js";
import { wTaylorCompounded } from "./morphoUtils.js";
import { BalanceOutput } from "@swell-network/swentio-utils/dist/shared/types.js";
import { SingleAprOutput } from "@swell-network/swentio-utils/dist/apr/types.js";
import { AprMetaDataId } from "@swell-network/swentio-utils/dist/apr/metadata.js";
import { bigD2Num } from "@swell-network/swentio-utils/dist/apr/utils.js";
import { getUsdExchangeRate } from "@swell-network/swentio-utils/dist/prices/price.js";
import { sumAprOutputArray } from "@swell-network/swentio-utils/dist/apr/sum.js";
import { PositionType } from "./schema/schema.js";
import { getAPR } from "@swell-network/swentio-utils/dist/apr/apr.js";
import { getGaugeV2ContractOnContext } from "./types/eth/gaugev2.js";

const config = configs[deploymentID];

export async function getProtocolState(
  ctx: EthContext,
  triggerEvent: string = "Transfer"
): Promise<ERC20State> {
  const currentTimestamp = ctx.timestamp.getTime();
  const { morphoBlueAddress, marketId } = config;
  const loanDecimals = config.supplyToken.decimals;

  const morphoBlue = getMorphoContractOnContext(ctx, morphoBlueAddress);
  const [marketParams, marketState, underlyingPrice] = await Promise.all([
    morphoBlue.idToMarketParams(marketId),
    morphoBlue.market(marketId),
    getUsdExchangeRate(ctx, config.supplyToken),
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

  const supplySharesScaled = BigInt(totalSupplyShares).scaleDown(
    loanDecimals + 6
  );
  const borrowSharesScaled = BigInt(totalBorrowShares).scaleDown(
    loanDecimals + 6
  );
  const totalSupply = BigInt(totalSupplyAssets).scaleDown(loanDecimals);
  const supplyToSharesRatio = totalSupply.div(supplySharesScaled);

  let borrowAPY = BigDecimal(0);
  let supplyAPY = BigDecimal(0);
  const utilization = borrowSharesScaled.div(supplySharesScaled);
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

  // VAULT position
  const { supplyShares, borrowShares, collateral } = await morphoBlue.position(
    marketId,
    config.tokenAddress
  );
  const supplyBalance = supplyShares
    .scaleDown(loanDecimals + 6)
    .times(supplyToSharesRatio);
  const vaultSupply = (
    await getERC20ContractOnContext(ctx, config.tokenAddress).totalSupply()
  ).scaleDown(config.decimals);
  const newRatio = supplyBalance.div(vaultSupply);

  const supplyBalanceUsd = supplyBalance.times(underlyingPrice);
  const supplyBreakdown: BalanceOutput[] = [
    {
      token: config.supplyToken.address,
      symbol: config.supplyToken.symbol ?? "",
      native: supplyBalance,
      usd: supplyBalanceUsd,
    },
  ];

  const scaledSupplyApy = supplyAPY.times(newRatio);

  const supplyAprOutput: SingleAprOutput = {
    aprType: "SINGLE",
    aprMetadata: AprMetaDataId.morpho_supply,
    apr: bigD2Num(scaledSupplyApy),
  };
  const tokenApr: SingleAprOutput = {
    aprType: "SINGLE",
    aprMetadata: config.supplyToken.symbol!,
    apr: bigD2Num(await getAPR(ctx, config.supplyToken)),
  };
  const aprs = [supplyAprOutput, tokenApr].filter((item) => item.apr !== 0);
  const totalApr = sumAprOutputArray(aprs);

  ctx.eventLogger.emit("protocol_state", {
    triggerEvent,
    // protocol status
    sub_protocol_id: PositionType.LP,
    supply: supplyBalance,
    supplyBreakdown: JSON.stringify(supplyBreakdown),
    exchangeRate: newRatio,
    rateLastUpdatedAt: BigInt(currentTimestamp),
    aprTotal: JSON.stringify(totalApr),
    aprBreakdown: JSON.stringify(aprs),
    // earnAPI
    supplyUsd: supplyBalanceUsd,
  });

  // Gauge
  if (config.gauge && ctx.blockNumber >= config.gauge.startBlock) {
    const gaugeBalanceRaw = await getERC20ContractOnContext(
      ctx,
      config.tokenAddress
    ).balanceOf(config.gauge.address);
    const gaugeBalance = gaugeBalanceRaw.scaleDown(config.decimals);
    const gaugeBalanceUsd = gaugeBalance.times(underlyingPrice);
    const gaugeSupplyBreakdown: BalanceOutput[] = [
      {
        token: config.supplyToken.address,
        symbol: config.supplyToken.symbol ?? "",
        native: gaugeBalance,
        usd: gaugeBalanceUsd,
      },
    ];

    const aprPromises = config.gauge.rewardTokens.map(
      async (reward) =>
        await getGaugeV2ContractOnContext(ctx, config.gauge!.address)
          .rewardRate(reward.address)
          .then((rewardRateRaw) => {
            return rewardRateRaw.scaleDown(18);
          })
    );
    const pricePromises = config.gauge.rewardTokens.map(
      async (reward) => await getUsdExchangeRate(ctx, reward)
    );
    const [rewardRates, rewardPrices] = await Promise.all([
      Promise.all(aprPromises),
      Promise.all(pricePromises),
    ]);
    const rewardAprs = rewardRates.map((rate, i) => {
      if (gaugeBalance.eq(0)) {
        return {
          aprType: "SINGLE" as const,
          aprMetadata: config.gauge!.rewardTokens[i].symbol ?? "",
          apr: 0,
        };
      }
      const yearlyRewards = rate.times(60 * 60 * 24 * 365);
      const rewardUsd = yearlyRewards.times(rewardPrices[i]);
      const apr = rewardUsd.div(gaugeBalanceUsd).times(100);

      ctx.eventLogger.emit("apr_debug_log", {
        triggerEvent,
        sub_protocol_id: PositionType.GAUGE,
        aprMetadata: config.gauge!.rewardTokens[i].symbol ?? "",
        apr: bigD2Num(apr),
        rewardPrice: rewardPrices[i],
        rewardRate: bigD2Num(rate),
        rewardUsd: bigD2Num(rewardUsd),
        gaugeBalanceUsd: bigD2Num(gaugeBalanceUsd),
      });

      return {
        aprType: "SINGLE" as const,
        aprMetadata: config.gauge!.rewardTokens[i].symbol ?? "",
        apr: bigD2Num(apr),
      };
    });

    const gaugeAprs = [...aprs, ...rewardAprs].filter((item) => item.apr !== 0);
    const gaugeTotalApr = sumAprOutputArray(gaugeAprs);

    ctx.eventLogger.emit("protocol_state", {
      triggerEvent,
      // protocol status
      sub_protocol_id: PositionType.GAUGE,
      supply: gaugeBalance,
      supplyBreakdown: JSON.stringify(gaugeSupplyBreakdown),
      exchangeRate: newRatio,
      rateLastUpdatedAt: BigInt(currentTimestamp),
      aprTotal: JSON.stringify(gaugeTotalApr),
      aprBreakdown: JSON.stringify(gaugeAprs),
      // earnAPI
      supplyUsd: gaugeBalanceUsd,
    });
  }

  const protocolState = {
    supply: vaultSupply,
    exchangeRate: newRatio,
    usdPrice: BigDecimal(1),
    // ethPrice: ethPrice,
  };

  return protocolState;
}
