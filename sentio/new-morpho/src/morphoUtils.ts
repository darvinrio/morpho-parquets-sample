// MORPHO UTILS

import { EthContext } from "@sentio/sdk/eth";
import { getMorphoChainlinkOracleV2ContractOnContext } from "./types/eth/morphochainlinkoraclev2.js";
import { BigDecimal, LogLevel } from "@sentio/sdk";

// ref: https://docs.morpho.org/morpho/tutorials/track-positions
export const pow10 = (exponant: bigint | number) => 10n ** BigInt(exponant);
export const WAD = pow10(18);
export const wMulDown = (x: bigint, y: bigint): bigint => mulDivDown(x, y, WAD);
export const wDivDown = (x: bigint, y: bigint): bigint => mulDivDown(x, WAD, y);
export const wDivUp = (x: bigint, y: bigint): bigint => mulDivUp(x, WAD, y);
export const mulDivDown = (x: bigint, y: bigint, d: bigint): bigint =>
  (x * y) / d;
export const mulDivUp = (x: bigint, y: bigint, d: bigint): bigint =>
  (x * y + (d - 1n)) / d;

export const wTaylorCompounded = (x: bigint, n: bigint): bigint => {
  const firstTerm = x * n;
  const secondTerm = mulDivDown(firstTerm, firstTerm, 2n * WAD);
  const thirdTerm = mulDivDown(secondTerm, firstTerm, 3n * WAD);
  return firstTerm + secondTerm + thirdTerm;
};

export const morphoOracle = async (
  ctx: EthContext,
  oracleAddress: string,
  loanPrice: BigDecimal
) => {
  if (oracleAddress === "0x0000000000000000000000000000000000000000") {
    ctx.eventLogger.emit("MorphoOracleMissing", {
      message: "Morpho oracle address is zero address",
      loglevel: LogLevel.WARNING,
    });
    return loanPrice;
  }
  const morphoOracleContract = getMorphoChainlinkOracleV2ContractOnContext(
    ctx,
    oracleAddress
  );
  const [price, scaleFactor] = await Promise.all([
    morphoOracleContract.price(),
    morphoOracleContract.SCALE_FACTOR(),
  ]);
  const decimals = scaleFactor.toString().length - 1;
  return price.scaleDown(decimals).times(loanPrice);
};
