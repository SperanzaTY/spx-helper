# Migration Guidance Examples

## Daily Full ODS/DF to Incremental Fleet Order DI

Use this pattern when a GSheet row maps an old full-snapshot fleet order or measurement table to `spx_datamart.dwd_spx_fleet_order_di_{cid}`.

Problem signal:
- Owner says the new table is empty or returns mostly null.
- Old SQL filters a full table by `grass_date = max(grass_date)` or `grass_date = current_date - 1`.
- GSheet comment says the replacement is a DI incremental table.

Diagnosis:
- Compare latest partition availability for old and new tables.
- Count rows with the business predicate in:
  - old latest full partition;
  - new latest DI partition;
  - new DI all partitions.
- If all-partition DI has data but latest DI partition has few/no rows, the owner probably kept old full-snapshot filtering.

Suggested fix:

```sql
-- before: full snapshot table
FROM spx_mart.ods_shopee_fleet_order_br_db__fleet_order_measurement_tab_df_br
WHERE grass_date = (
  SELECT max(grass_date)
  FROM spx_mart.ods_shopee_fleet_order_br_db__fleet_order_measurement_tab_df_br
)
  AND manual_measure_info IS NOT NULL
  AND manual_measure_info <> ''

-- after: incremental table, query all relevant partitions unless business logic needs a date window
FROM spx_datamart.dwd_spx_fleet_order_di_br
WHERE manual_measure_info IS NOT NULL
  AND manual_measure_info <> ''
```

Prefer prepared columns where they exist:

```sql
SELECT
  shipment_id,
  CAST(manual_package_length AS decimal(12,2)) AS manual_length,
  CAST(manual_package_width AS decimal(12,2)) AS manual_width,
  CAST(manual_package_height AS decimal(12,2)) AS manual_height,
  CASE WHEN manual_package_weight <= 30000 THEN manual_package_weight / 1000 ELSE 0 END AS manual_weight_kg,
  CASE WHEN manual_package_weight <= 30000 THEN manual_package_weight ELSE 0 END AS manual_weight
FROM spx_datamart.dwd_spx_fleet_order_di_br
WHERE manual_measure_info IS NOT NULL
  AND manual_measure_info <> ''
```

Evidence to include:
- Latest successful Scheduler instance and SQL source.
- DataStudio owner project asset lookup status.
- `spx_datamart` replacement asset/local module path.
- Lightweight Presto validation counts and sample rows.

## Station Dimension to Network Station Dimension

Use this pattern for `spx_mart.dim_spx_station_{cid}` to `spx_datamart.dim_spx_network_station_{cid}`.

Suggested fix:

```sql
-- before
SELECT
  station.id AS station_id,
  station.station_name,
  station.station_code
FROM spx_mart.dim_spx_station_br AS station
WHERE station.grass_region = 'BR'
  AND station.tz_type = 'local'
  AND station.grass_date = (
    SELECT max(grass_date)
    FROM spx_mart.dim_spx_station_br
    WHERE grass_region = 'BR'
  )

-- after
SELECT
  station.station_id,
  station.station_name,
  station.station_code
FROM spx_datamart.dim_spx_network_station_br AS station
WHERE station.grass_date = (
  SELECT max(grass_date)
  FROM spx_datamart.dim_spx_network_station_br
)
```

Notes:
- Remove `grass_region` and `tz_type` filters; the new market table is already market-specific and these columns normally do not exist.
- Rename old `id` to new `station_id`.
