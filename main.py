from typing import cast

import polars as pl
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
from loguru import logger

logger.info("Starting...")

PARQUET_MAP = {
    "morpho_positions.parquet": "Contains the latest positions of the Whitelisted Addresses",
    "morpho_Vaults.parquet": "Historical positions of the Whitelisted Addresses",
    "morpho_yieldAPR.parquet": "Historical APR, TVL, Supply and Borrows of a market or vault",
    "morpho_yieldBalance.parquet": "Historical balance of supply or borrow in a market or a metavault by a whitelisted address",
}

for file, description in PARQUET_MAP.items():
    logger.info(f"Reading {file}...")
    logger.info(f"Description: {description}")

    table = pq.read_table(file)
    # table_schema = pq.read_schema(file)
    table_schema = table.schema

    # logger.info(table_schema.types)
    # logger.info(table_schema.names)
    for name, dtype in zip(table_schema.names, table_schema.types):
        # logger.debug(f"{name}: {dtype}")
        if isinstance(dtype, pa.Decimal256Type) or (
            isinstance(dtype, pa.Decimal128Type) and dtype.precision > 38
        ):
            casted_col = pc.cast(table[name], pa.float64())
            idx = table.schema.get_field_index(name)
            table = table.set_column(idx, name, casted_col)

    # # logger.info(f"Table: {table.schema}")

    # position_df = pl.read_parquet(file, use_pyarrow=True)
    position_df = cast(pl.DataFrame, pl.from_arrow(table))

    schema = position_df.collect_schema()
    # logger.info(f"Schema: {schema}")
    # logger.info(f"First 5 rows: {position_df.head(5)}")
    position_df.head(100).write_csv(f"samples/{file}.csv")
    logger.info(f"Size: {position_df.shape}")

    try:
        min_timestamp = position_df.select(pl.col("timestamp").min())
        min_block = position_df.select(pl.col("meta.block_number").min())
        max_timestamp = position_df.select(pl.col("timestamp").max())
        max_block = position_df.select(pl.col("meta.block_number").max())

        logger.info(
            f"Min timestamp: {min_timestamp.item()} (block: {min_block.item()})"
        )
        logger.info(
            f"Max timestamp: {max_timestamp.item()} (block: {max_block.item()})"
        )
    except pl.exceptions.ColumnNotFoundError:
        logger.warning("No timestamp column")

    logger.info("Done.")
