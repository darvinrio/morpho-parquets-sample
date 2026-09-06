import { configs } from "./config.js";
import { deploymentID } from "./deployment.js";
import { MorphoProcessor } from "./types/eth/morpho.js";
import { BigDecimal, LogLevel } from "@sentio/sdk";
import { MetaMorphoFactoryProcessor } from "./types/eth/metamorphofactory.js";
import { MetaVault, MorphoState } from "./schema/schema.js";
import {
  MetaMorphoProcessor,
  MetaMorphoProcessorTemplate,
} from "./types/eth/metamorpho.js";
import { checksumAddress } from "viem";
import {
  logAllAddressMarkets,
  logAllMarketRates,
  logMarketRates,
  logOneAddressMarket,
} from "./market.js";
import {
  logVaultRates,
  logAllVaultRates,
  logAllAddressesAllVaults,
  logOneAddressVault,
} from "./vault.js";
import { getERC20ContractOnContext } from "@sentio/sdk/eth/builtin/erc20";
import { getAPR } from "@swell-network/swentio-utils/dist/apr/apr.js";

const config = configs[deploymentID];
const assets = config.whitelistedAssets.map((asset) => asset.address);

const morphoBorrowFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.Borrow(null, null, addr)
);
const morphoSupplyFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.Supply(null, null, addr)
);
const morphoWithdrawFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.Withdraw(null, null, addr)
);
const morphoRepayFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.Repay(null, null, addr)
);
const morphoSupplyCollateralFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.SupplyCollateral(null, null, addr)
);
const morphoWithdrawCollateralFilter = config.whitelistedAddresses?.map(
  (addr) => MorphoProcessor.filters.WithdrawCollateral(null, null, addr)
);
const morphoLiquidateFilter = config.whitelistedAddresses?.map((addr) =>
  MorphoProcessor.filters.Liquidate(null, null, addr)
);

MorphoProcessor.bind({
  address: config.morphoBlue,
  network: config.network,
  startBlock: config.morphoStartBlock,
})
  .onEventCreateMarket(async (event, ctx) => {
    const marketId = event.args.id;
    const marketParams = event.args.marketParams;
    const loanAsset = config.whitelistedAssets.find(
      (token) => token.address === marketParams.loanToken
    );
    if (!loanAsset) {
      ctx.eventLogger.emit("ignored_market", {
        protocol_id: config.protocol,
        marketId: marketId,
        loanToken: marketParams.loanToken,
        reason: "loan token not in whitelist",
        eventName: event.name,
        severity: LogLevel.WARNING,
      });
      return;
    }
    const vaultName =
      "Morpho " + loanAsset.symbol + " " + marketId.substring(0, 6);
    const protocolId =
      "morpho_" +
      loanAsset.symbol?.toLowerCase() +
      "_" +
      marketId.toLowerCase() +
      "_" +
      ctx.chainId;
    const [collateralDecimals, loanDecimals, collateralSymbol, loanSymbol] =
      await Promise.all([
        getERC20ContractOnContext(ctx, marketParams.collateralToken)
          .decimals()
          .catch(() => 18n),
        getERC20ContractOnContext(ctx, marketParams.loanToken).decimals(),
        getERC20ContractOnContext(ctx, marketParams.collateralToken)
          .symbol()
          .catch(() => "unknown"),
        getERC20ContractOnContext(ctx, marketParams.loanToken).symbol(),
      ]);

    const [collateralApr, underlyingApr] = await Promise.all([
      getAPR(
        ctx,
        marketParams.collateralToken,
        Number(collateralDecimals)
      ).catch(() => BigDecimal(0)),
      getAPR(ctx, marketParams.loanToken, Number(loanDecimals)).catch(() =>
        BigDecimal(0)
      ),
    ]);
    const morphoState = new MorphoState({
      id: marketId,
      updatedAt: BigInt(ctx.timestamp.getTime() / 1000),
      vaultName: vaultName,
      protocolId: protocolId,
      collateralAsset: marketParams.collateralToken,
      collateralDecimals: collateralDecimals,
      collateralSymbol: collateralSymbol,
      collateralOracle: marketParams.oracle,
      loanAsset: marketParams.loanToken,
      loanDecimals: loanDecimals,
      loanSymbol: loanSymbol,
      collateralUsdPrice: BigDecimal(0),
      loanUsdPrice: BigDecimal(0),
      collateralUnderlyingApr: collateralApr,
      loanUnderlyingApr: underlyingApr,
      supplyApy: BigDecimal(0),
      borrowApy: BigDecimal(0),
      loanToSharesRatio: BigDecimal(1),
      supplyToSharesRatio: BigDecimal(1),
      borrowRate: 0n,
    });
    await ctx.store.upsert(morphoState);
    await logMarketRates(ctx, event.name, marketId, 0n);
  })
  .onEventAccrueInterest(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    const marketId = event.args.id;
    const borrowRate = event.args.prevBorrowRate;
    await logMarketRates(ctx, event.name, marketId, borrowRate);
  })
  .onEventBorrow(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoBorrowFilter)
  .onEventSupply(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoSupplyFilter)
  .onEventWithdraw(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoWithdrawFilter)
  .onEventRepay(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoRepayFilter)
  .onEventSupplyCollateral(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoSupplyCollateralFilter)
  .onEventWithdrawCollateral(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.onBehalf
    );
  }, morphoWithdrawCollateralFilter)
  .onEventLiquidate(async (event, ctx) => {
    if (ctx.blockNumber < config.startBlock) return;
    return await logOneAddressMarket(
      ctx,
      event.name,
      event.args.id,
      event.args.borrower
    );
  }, morphoLiquidateFilter)
  .onTimeInterval(
    async (_, ctx) => {
      if (ctx.blockNumber < config.startBlock) return;
      await logAllMarketRates(ctx, "TimeInterval");
      await logAllAddressMarkets(
        ctx,
        "TimeInterval",
        config.whitelistedAddresses ?? []
      );
      await logAllVaultRates(ctx, "TimeInterval");
      await logAllAddressesAllVaults(
        ctx,
        "TimeInterval",
        config.whitelistedAddresses ?? []
      );
    },
    4 * 60,
    4 * 60
  );

const transferFilters = config.whitelistedAddresses?.flatMap((addr) => [
  MetaMorphoProcessor.filters.Transfer(addr, null),
  MetaMorphoProcessor.filters.Transfer(null, addr),
]);
const metaMorphoTemplate = new MetaMorphoProcessorTemplate()
  .onEventAccrueInterest(async (event, ctx) => {
    await logVaultRates(
      ctx,
      event.name,
      checksumAddress(ctx.address as `0x${string}`)
    );
  })
  .onEventTransfer(async (event, ctx) => {
    await logVaultRates(
      ctx,
      event.name,
      checksumAddress(ctx.address as `0x${string}`)
    );
    const updateAddresses = [event.args.from, event.args.to].filter((addr) =>
      config.whitelistedAddresses?.includes(addr as `0x${string}`)
    );
    await Promise.all(
      updateAddresses.map(async (addr) => {
        await logOneAddressVault(
          ctx,
          event.name,
          checksumAddress(ctx.address as `0x${string}`),
          addr
        );
      })
    );
  }, transferFilters);

MetaMorphoFactoryProcessor.bind({
  address: config.metaMorphoFactory,
  network: config.network,
  startBlock: config.morphoStartBlock,
}).onEventCreateMetaMorpho(async (event, ctx) => {
  const { metaMorpho, asset, name, symbol } = event.args;
  if (assets.includes(asset)) {
    const vaultDecimals = await getERC20ContractOnContext(ctx, metaMorpho)
      .decimals()
      .catch(() => 18n);
    const underlyingDecimals = await getERC20ContractOnContext(ctx, asset)
      .decimals()
      .catch(() => 18n);
    const vaultName = name || symbol.replaceAll(" ", "_") || "MetaMorpho Vault";
    const metaMorphoVault = new MetaVault({
      id: metaMorpho,
      vault: metaMorpho,
      vaultDecimals: vaultDecimals,
      underlyingDecimals: underlyingDecimals,
      underlying: asset,
      vaultName: vaultName,
    });
    ctx.eventLogger.emit("new_vault", {
      protocol_id: config.protocol,
      vault: metaMorpho,
      underlying: asset,
      vaultName: vaultName,
      eventName: event.name,
    });
    await ctx.store.upsert(metaMorphoVault);

    const metaStartingBlock =
      ctx.blockNumber > config.startBlock ? ctx.blockNumber : config.startBlock;
    metaMorphoTemplate.bind(
      {
        address: metaMorpho,
        startBlock: metaStartingBlock,
      },
      ctx
    );
  } else {
    ctx.eventLogger.emit("ignored_vault", {
      protocol_id: config.protocol,
      vault: metaMorpho,
      underlying: asset,
      vaultName: name || symbol || "MetaMorpho Vault",
      eventName: event.name,
      reason: "underlying not in whitelist",
      severity: LogLevel.WARNING,
    });
  }
});
