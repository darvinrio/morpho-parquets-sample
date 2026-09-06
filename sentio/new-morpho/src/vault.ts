import { EthContext } from "@sentio/sdk/eth";
import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { getMorphoContractOnContext } from "./types/eth/morpho.js";
import { BigDecimal, LogLevel } from "@sentio/sdk";
import { AprOutput } from "@swell-network/swentio-utils/dist/apr/types.js";
import { bigD2Num } from "@swell-network/swentio-utils/dist/apr/utils.js";
import { sumAprOutputArray } from "@swell-network/swentio-utils/dist/apr/sum.js";
import { MetaVault, MorphoState } from "./schema/schema.js";
import { getMetaMorphoContractOnContext } from "./types/eth/metamorpho.js";

const config = configs[deploymentID];
const assets = config.whitelistedAssets.map((asset) => asset.address);

interface Position {
  marketId: string;
  supplyAPY: BigDecimal;
  supplyBalance: BigDecimal;
  usdBalance: BigDecimal;
}

async function getVaultPositions(
  ctx: EthContext,
  vault: MetaVault,
  vaultAddress: string,
  metaVaultContract: ReturnType<typeof getMetaMorphoContractOnContext>,
  marketsLength: bigint
): Promise<{ positions: Position[]; totalUsdSupply: BigDecimal }> {
  const morphoBlueContract = getMorphoContractOnContext(ctx, config.morphoBlue);
  const marketsDetails = await ctx.store.list(MorphoState, [
    { field: "loanAsset", op: "=", value: vault.underlying },
  ]);

  if (marketsDetails.length === 0) {
    return { positions: [], totalUsdSupply: BigDecimal(0) };
  }

  const loanUsdPrice = marketsDetails[0].loanUsdPrice;
  let totalUsdSupply = BigDecimal(0);

  const positions = await Promise.all(
    Array.from({ length: Number(marketsLength) }).map(async (_, i) => {
      const marketId = await metaVaultContract.withdrawQueue(i);
      const marketState = marketsDetails.find((state) => state.id === marketId);
      let supplyToSharesRatio: BigDecimal;
      let supplyApy: BigDecimal;
      if (!marketState) {
        supplyToSharesRatio = BigDecimal(1);
        supplyApy = BigDecimal(0);
      } else {
        supplyToSharesRatio = marketState.supplyToSharesRatio;
        supplyApy = marketState.supplyApy;
      }
      const { supplyShares } = await morphoBlueContract.position(
        marketId,
        vaultAddress
      );
      const supplyBalance = supplyShares
        .scaleDown(vault.underlyingDecimals + 6n)
        .times(supplyToSharesRatio);
      const usdSupply = supplyBalance.times(loanUsdPrice);
      totalUsdSupply = totalUsdSupply.plus(usdSupply);
      return {
        marketId,
        supplyAPY: supplyApy,
        supplyBalance: supplyBalance,
        usdBalance: usdSupply,
      };
    })
  );

  return { positions, totalUsdSupply };
}

function calculateAprBreakdown(
  positions: Position[],
  totalUsdSupply: BigDecimal
): AprOutput[] {
  return positions.map((position) => {
    const scaledApr = totalUsdSupply.eq(0)
      ? BigDecimal(0)
      : position.supplyAPY.times(position.usdBalance).div(totalUsdSupply);
    return {
      aprType: "SINGLE" as const,
      apr: bigD2Num(scaledApr),
      aprMetadata: position.marketId,
    };
  });
}

function getProtocolId(vaultName: string, chainId: number | string): string {
  return (
    "morpho_" + vaultName.toLowerCase().replaceAll(" ", "_") + "_" + chainId
  );
}

export async function logVaultRates(
  ctx: EthContext,
  eventName: string,
  vaultAddress: string = ctx.address
): Promise<void> {
  const now = BigInt(ctx.timestamp.getTime() / 1000);
  const metaVault = await ctx.store.get(MetaVault, vaultAddress);
  if (!metaVault) {
    console.error("MetaVault not found in store for address", vaultAddress);
    ctx.eventLogger.emit("missing_metavault", {
      vault: vaultAddress,
      severity: LogLevel.ERROR,
    });
    return;
  }
  const metaVaultAddress = vaultAddress;
  const metaVaultName = metaVault.vaultName;
  const metaVaultContract = getMetaMorphoContractOnContext(
    ctx,
    metaVaultAddress
  );
  const morphoBlueContract = getMorphoContractOnContext(ctx, config.morphoBlue);
  const [supply, marketsLength, sharesToAssets] = await Promise.all([
    metaVaultContract.totalSupply(),
    metaVaultContract.withdrawQueueLength(),
    metaVaultContract.convertToAssets(10n ** metaVault.vaultDecimals),
  ]);

  const currentRate = sharesToAssets.scaleDown(metaVault.underlyingDecimals);
  const supplyScaled = supply.scaleDown(metaVault.vaultDecimals);
  if (marketsLength === 0n) {
    return;
  }

  const { positions, totalUsdSupply } = await getVaultPositions(
    ctx,
    metaVault,
    metaVaultAddress,
    metaVaultContract,
    marketsLength
  );

  if (positions.length === 0) {
    ctx.eventLogger.emit("missing_markets", {
      loanAsset: metaVault.underlying,
      vault: metaVaultAddress,
      vaultName: metaVaultName,
      severity: LogLevel.ERROR,
    });
    return;
  }

  const vaultName = metaVaultName;
  const protocolId = getProtocolId(vaultName, ctx.chainId);

  ctx.eventLogger.emit("morpho_positions", {
    protocol_id: config.protocol,
    vault: metaVaultAddress,
    positions: JSON.stringify(positions),
  });

  // Emit individual yieldBalance events for each market position
  for (const position of positions) {
    const marketProtocolId = `${protocolId}_market_${position.marketId.slice(0, 8)}`;
    const positionAprBreakdown = calculateAprBreakdown(
      [position],
      position.usdBalance
    );
    const positionAprTotal = sumAprOutputArray(positionAprBreakdown);

    ctx.eventLogger.emit("yieldBalance", {
      protocol_id: marketProtocolId,
      vaultType: "MorphoMarket",
      vaultName: `${metaVaultName} - Market ${position.marketId.slice(0, 8)}`,
      vaultAddress: position.marketId,
      eventName: eventName,
      account: metaVaultAddress,
      balance: position.supplyBalance,
      balanceUsd: position.usdBalance,
      lastUpdatedAt: Number(now),
      lastRate: currentRate,
      lastApr: positionAprTotal.apr,
      aprBreakdown: JSON.stringify(positionAprBreakdown),
      aprTotal: JSON.stringify(positionAprTotal),
    });
  }

  const aprBreakdown = calculateAprBreakdown(positions, totalUsdSupply);
  const aprTotal = sumAprOutputArray(aprBreakdown);

  ctx.eventLogger.emit("yieldAPR", {
    protocol_id: protocolId,
    vaultType: "MetaMorpho",
    vaultName: vaultName,
    vaultAddress: metaVaultAddress,
    oracleAddress: config.morphoBlue,
    eventName: eventName,
    lastUpdatedAt: Number(now),
    lastApr: aprTotal.apr,
    lastRate: currentRate,
    supply: supplyScaled,
    usdSupply: totalUsdSupply,
    aprBreakdown: JSON.stringify(aprBreakdown),
    aprTotal: JSON.stringify(aprTotal),

    // Additional fields for Morpho UI
    supplySharePrice: currentRate,
    underlyingSharePrice: BigDecimal(1),
  });
}

export async function logOneAddressVault(
  ctx: EthContext,
  eventName: string,
  vaultAddress: string,
  address: string,
  metaVault?: MetaVault
) {
  const vault = metaVault ?? (await ctx.store.get(MetaVault, vaultAddress));
  if (!vault) {
    ctx.eventLogger.emit("missing_metavault", {
      vaultAddress: vaultAddress,
      severity: LogLevel.ERROR,
    });
    return;
  }

  const now = BigInt(ctx.timestamp.getTime() / 1000);
  const metaVaultContract = getMetaMorphoContractOnContext(ctx, vaultAddress);

  const [userBalance, totalSupply, sharesToAssets, marketsLength] =
    await Promise.all([
      metaVaultContract.balanceOf(address),
      metaVaultContract.totalSupply(),
      metaVaultContract.convertToAssets(10n ** vault.vaultDecimals),
      metaVaultContract.withdrawQueueLength(),
    ]);

  if (userBalance === 0n && eventName === "TimeInterval") {
    return;
  }

  const currentRate = sharesToAssets.scaleDown(vault.underlyingDecimals);
  const totalSupplyScaled = totalSupply.scaleDown(vault.vaultDecimals);
  const userBalanceScaled = userBalance.scaleDown(vault.vaultDecimals);

  let totalUsdSupply = BigDecimal(0);
  let aprBreakdown: AprOutput[] = [];

  if (marketsLength > 0n) {
    const { positions, totalUsdSupply: vaultTotalUsdSupply } =
      await getVaultPositions(
        ctx,
        vault,
        vaultAddress,
        metaVaultContract,
        marketsLength
      );
    totalUsdSupply = vaultTotalUsdSupply;
    aprBreakdown = calculateAprBreakdown(positions, totalUsdSupply);
  }

  const aprTotal = sumAprOutputArray(aprBreakdown);
  const usdBalance = totalSupplyScaled.eq(0)
    ? BigDecimal(0)
    : userBalanceScaled.times(totalUsdSupply).div(totalSupplyScaled);

  const vaultName = vault.vaultName;
  const protocolId = getProtocolId(vaultName, ctx.chainId);

  ctx.eventLogger.emit("yieldBalance", {
    protocol_id: protocolId,
    vaultType: "MetaMorpho",
    vaultName: vaultName,
    vaultAddress: vaultAddress,
    eventName: eventName,
    account: address,
    balance: userBalanceScaled,
    balanceUsd: usdBalance,
    lastUpdatedAt: Number(now),
    lastRate: currentRate,
    lastApr: aprTotal.apr,
    aprBreakdown: JSON.stringify(aprBreakdown),
    aprTotal: JSON.stringify(aprTotal),
  });
}

export async function logAllAddressesVault(
  ctx: EthContext,
  eventName: string,
  vaultAddress: string,
  addresses: string[]
) {
  const vault = await ctx.store.get(MetaVault, vaultAddress);
  if (!vault) {
    ctx.eventLogger.emit("missing_metavault", {
      vaultAddress: vaultAddress,
      severity: LogLevel.ERROR,
    });
    return;
  }

  // Loop through all addresses for this vault
  for (const address of addresses) {
    try {
      await logOneAddressVault(ctx, eventName, vaultAddress, address, vault);
    } catch (error) {
      ctx.eventLogger.emit("vault_position_error", {
        vaultAddress: vaultAddress,
        address: address,
        error: error instanceof Error ? error.message : String(error),
        severity: LogLevel.WARNING,
      });
    }
  }
}

export async function logAllAddressesAllVaults(
  ctx: EthContext,
  eventName: string,
  addresses: string[]
) {
  const vaults = await ctx.store.list(MetaVault);

  // Loop through all vaults
  for (const vault of vaults) {
    const vaultAddress = vault.id as string;

    // Loop through all provided addresses
    for (const address of addresses) {
      try {
        await logOneAddressVault(ctx, eventName, vaultAddress, address, vault);
      } catch (error) {
        ctx.eventLogger.emit("vault_position_error", {
          vaultAddress: vaultAddress,
          address: address,
          error: error instanceof Error ? error.message : String(error),
          severity: LogLevel.WARNING,
        });
      }
    }
  }
}

export async function logAllVaultRates(ctx: EthContext, eventName: string) {
  const vaultState = await ctx.store.list(MetaVault);
  await Promise.all(
    vaultState.map(async (vault) => {
      await logVaultRates(ctx, eventName, vault.id as string);
    })
  );
}
