-- One-time typed-candidate build for the existing BTS_ON_TIME_RAW table.
-- Not idempotent: a pre-existing candidate or backup causes a clear stop; no object is reused.
-- Source audit: all 631,428 CSV FlightDate values are YYYY-MM-DD; README says yyyymmdd.
-- 30 measures use NUMBER(7,2), allowing fractional values; observed absolute maximum is 5,095.00.
-- Integer dimensions, indicators, groups, and counts use precision sized to their meaning/range.
-- IDs, categorical codes, and HHMM time fields remain VARCHAR to preserve representation.
-- Empty numeric fields become NULL in the typed candidate; the original keeps source strings.
-- This creates and validates a separate candidate only; the current table is never renamed here.
-- Manually plan cutover only after validation and a backup-name check. Rename/swap can
-- affect grants, dependencies, and future direct CSV loads. Reapply grants, update references
-- and loader empty-field handling as needed. Keep backup.

EXECUTE IMMEDIATE $$
DECLARE
    e_existing_migration_object EXCEPTION (-20001, 'STOP: BTS_ON_TIME_RAW_TYPED or BTS_ON_TIME_RAW_VARCHAR_BACKUP already exists. Inspect migration state; this script will not overwrite, reuse, or rename either object. Resolve manually before retrying.');
    e_source_missing EXCEPTION (-20002, 'STOP: AIRLINES.L1_LANDING.BTS_ON_TIME_RAW is missing or is not a base table. No migration object was created.');
    e_source_shape EXCEPTION (-20003, 'STOP: source table must have exactly 109 VARCHAR columns. Verify its schema against the CSV header before proceeding.');
    e_candidate_validation EXCEPTION (-20004, 'STOP: typed candidate failed row-count, column-count, or type validation. The original table was left untouched; inspect the candidate before any retry.');
    v_existing_migration_objects NUMBER;
    v_source_tables NUMBER;
    v_source_columns NUMBER;
    v_source_non_varchar_columns NUMBER;
    v_source_rows NUMBER;
    v_typed_rows NUMBER;
    v_typed_columns NUMBER;
    v_type_mismatches NUMBER;
BEGIN
    SELECT COUNT(*) INTO :v_existing_migration_objects
    FROM AIRLINES.INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_NAME IN ('BTS_ON_TIME_RAW_TYPED', 'BTS_ON_TIME_RAW_VARCHAR_BACKUP');

    IF (v_existing_migration_objects > 0) THEN
        RAISE e_existing_migration_object;
    END IF;

    SELECT COUNT(*) INTO :v_source_tables
    FROM AIRLINES.INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_NAME = 'BTS_ON_TIME_RAW';

    IF (v_source_tables <> 1) THEN
        RAISE e_source_missing;
    END IF;

    SELECT COUNT(*) INTO :v_source_columns
    FROM AIRLINES.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_NAME = 'BTS_ON_TIME_RAW';

    SELECT COUNT(*) INTO :v_source_non_varchar_columns
    FROM AIRLINES.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_NAME = 'BTS_ON_TIME_RAW'
      AND DATA_TYPE NOT IN ('TEXT', 'VARCHAR');

    IF (v_source_columns <> 109 OR v_source_non_varchar_columns <> 0) THEN
        RAISE e_source_shape;
    END IF;

    SELECT COUNT(*) INTO :v_source_rows
    FROM AIRLINES.L1_LANDING.BTS_ON_TIME_RAW;

    CREATE TABLE AIRLINES.L1_LANDING.BTS_ON_TIME_RAW_TYPED
        COMMENT = 'Typed candidate for manual BTS raw-table cutover'
    AS
    SELECT
    TO_NUMBER(NULLIF("Year", ''), 4, 0) AS "Year",
    TO_NUMBER(NULLIF("Quarter", ''), 1, 0) AS "Quarter",
    TO_NUMBER(NULLIF("Month", ''), 2, 0) AS "Month",
    TO_NUMBER(NULLIF("DayofMonth", ''), 2, 0) AS "DayofMonth",
    TO_NUMBER(NULLIF("DayOfWeek", ''), 1, 0) AS "DayOfWeek",
    TO_DATE(NULLIF("FlightDate", ''), 'YYYY-MM-DD') AS "FlightDate",
    "Reporting_Airline",
    "DOT_ID_Reporting_Airline",
    "IATA_CODE_Reporting_Airline",
    "Tail_Number",
    "Flight_Number_Reporting_Airline",
    "OriginAirportID",
    "OriginAirportSeqID",
    "OriginCityMarketID",
    "Origin",
    "OriginCityName",
    "OriginState",
    "OriginStateFips",
    "OriginStateName",
    "OriginWac",
    "DestAirportID",
    "DestAirportSeqID",
    "DestCityMarketID",
    "Dest",
    "DestCityName",
    "DestState",
    "DestStateFips",
    "DestStateName",
    "DestWac",
    "CRSDepTime",
    "DepTime",
    TO_NUMBER(NULLIF("DepDelay", ''), 7, 2) AS "DepDelay",
    TO_NUMBER(NULLIF("DepDelayMinutes", ''), 7, 2) AS "DepDelayMinutes",
    TO_NUMBER(NULLIF("DepDel15", ''), 1, 0) AS "DepDel15",
    TO_NUMBER(NULLIF("DepartureDelayGroups", ''), 3, 0) AS "DepartureDelayGroups",
    "DepTimeBlk",
    TO_NUMBER(NULLIF("TaxiOut", ''), 7, 2) AS "TaxiOut",
    "WheelsOff",
    "WheelsOn",
    TO_NUMBER(NULLIF("TaxiIn", ''), 7, 2) AS "TaxiIn",
    "CRSArrTime",
    "ArrTime",
    TO_NUMBER(NULLIF("ArrDelay", ''), 7, 2) AS "ArrDelay",
    TO_NUMBER(NULLIF("ArrDelayMinutes", ''), 7, 2) AS "ArrDelayMinutes",
    TO_NUMBER(NULLIF("ArrDel15", ''), 1, 0) AS "ArrDel15",
    TO_NUMBER(NULLIF("ArrivalDelayGroups", ''), 3, 0) AS "ArrivalDelayGroups",
    "ArrTimeBlk",
    TO_NUMBER(NULLIF("Cancelled", ''), 1, 0) AS "Cancelled",
    "CancellationCode",
    TO_NUMBER(NULLIF("Diverted", ''), 1, 0) AS "Diverted",
    TO_NUMBER(NULLIF("CRSElapsedTime", ''), 7, 2) AS "CRSElapsedTime",
    TO_NUMBER(NULLIF("ActualElapsedTime", ''), 7, 2) AS "ActualElapsedTime",
    TO_NUMBER(NULLIF("AirTime", ''), 7, 2) AS "AirTime",
    TO_NUMBER(NULLIF("Flights", ''), 4, 0) AS "Flights",
    TO_NUMBER(NULLIF("Distance", ''), 7, 2) AS "Distance",
    TO_NUMBER(NULLIF("DistanceGroup", ''), 2, 0) AS "DistanceGroup",
    TO_NUMBER(NULLIF("CarrierDelay", ''), 7, 2) AS "CarrierDelay",
    TO_NUMBER(NULLIF("WeatherDelay", ''), 7, 2) AS "WeatherDelay",
    TO_NUMBER(NULLIF("NASDelay", ''), 7, 2) AS "NASDelay",
    TO_NUMBER(NULLIF("SecurityDelay", ''), 7, 2) AS "SecurityDelay",
    TO_NUMBER(NULLIF("LateAircraftDelay", ''), 7, 2) AS "LateAircraftDelay",
    "FirstDepTime",
    TO_NUMBER(NULLIF("TotalAddGTime", ''), 7, 2) AS "TotalAddGTime",
    TO_NUMBER(NULLIF("LongestAddGTime", ''), 7, 2) AS "LongestAddGTime",
    TO_NUMBER(NULLIF("DivAirportLandings", ''), 2, 0) AS "DivAirportLandings",
    TO_NUMBER(NULLIF("DivReachedDest", ''), 1, 0) AS "DivReachedDest",
    TO_NUMBER(NULLIF("DivActualElapsedTime", ''), 7, 2) AS "DivActualElapsedTime",
    TO_NUMBER(NULLIF("DivArrDelay", ''), 7, 2) AS "DivArrDelay",
    TO_NUMBER(NULLIF("DivDistance", ''), 7, 2) AS "DivDistance",
    "Div1Airport",
    "Div1AirportID",
    "Div1AirportSeqID",
    "Div1WheelsOn",
    TO_NUMBER(NULLIF("Div1TotalGTime", ''), 7, 2) AS "Div1TotalGTime",
    TO_NUMBER(NULLIF("Div1LongestGTime", ''), 7, 2) AS "Div1LongestGTime",
    "Div1WheelsOff",
    "Div1TailNum",
    "Div2Airport",
    "Div2AirportID",
    "Div2AirportSeqID",
    "Div2WheelsOn",
    TO_NUMBER(NULLIF("Div2TotalGTime", ''), 7, 2) AS "Div2TotalGTime",
    TO_NUMBER(NULLIF("Div2LongestGTime", ''), 7, 2) AS "Div2LongestGTime",
    "Div2WheelsOff",
    "Div2TailNum",
    "Div3Airport",
    "Div3AirportID",
    "Div3AirportSeqID",
    "Div3WheelsOn",
    TO_NUMBER(NULLIF("Div3TotalGTime", ''), 7, 2) AS "Div3TotalGTime",
    TO_NUMBER(NULLIF("Div3LongestGTime", ''), 7, 2) AS "Div3LongestGTime",
    "Div3WheelsOff",
    "Div3TailNum",
    "Div4Airport",
    "Div4AirportID",
    "Div4AirportSeqID",
    "Div4WheelsOn",
    TO_NUMBER(NULLIF("Div4TotalGTime", ''), 7, 2) AS "Div4TotalGTime",
    TO_NUMBER(NULLIF("Div4LongestGTime", ''), 7, 2) AS "Div4LongestGTime",
    "Div4WheelsOff",
    "Div4TailNum",
    "Div5Airport",
    "Div5AirportID",
    "Div5AirportSeqID",
    "Div5WheelsOn",
    TO_NUMBER(NULLIF("Div5TotalGTime", ''), 7, 2) AS "Div5TotalGTime",
    TO_NUMBER(NULLIF("Div5LongestGTime", ''), 7, 2) AS "Div5LongestGTime",
    "Div5WheelsOff",
    "Div5TailNum"
    FROM AIRLINES.L1_LANDING.BTS_ON_TIME_RAW;

    SELECT COUNT(*) INTO :v_typed_rows
    FROM AIRLINES.L1_LANDING.BTS_ON_TIME_RAW_TYPED;

    SELECT COUNT(*) INTO :v_typed_columns
    FROM AIRLINES.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_NAME = 'BTS_ON_TIME_RAW_TYPED';

    SELECT COUNT(*) INTO :v_type_mismatches
    FROM AIRLINES.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'L1_LANDING'
      AND TABLE_NAME = 'BTS_ON_TIME_RAW_TYPED'
      AND (
    (COLUMN_NAME = 'FlightDate' AND DATA_TYPE <> 'DATE') OR
    (COLUMN_NAME IN ('Quarter', 'DayOfWeek', 'DepDel15', 'ArrDel15', 'Cancelled', 'Diverted', 'DivReachedDest') AND (DATA_TYPE <> 'NUMBER' OR NUMERIC_PRECISION <> 1 OR NUMERIC_SCALE <> 0)) OR
    (COLUMN_NAME IN ('Month', 'DayofMonth', 'DistanceGroup', 'DivAirportLandings') AND (DATA_TYPE <> 'NUMBER' OR NUMERIC_PRECISION <> 2 OR NUMERIC_SCALE <> 0)) OR
    (COLUMN_NAME IN ('DepartureDelayGroups', 'ArrivalDelayGroups') AND (DATA_TYPE <> 'NUMBER' OR NUMERIC_PRECISION <> 3 OR NUMERIC_SCALE <> 0)) OR
    (COLUMN_NAME IN ('Year', 'Flights') AND (DATA_TYPE <> 'NUMBER' OR NUMERIC_PRECISION <> 4 OR NUMERIC_SCALE <> 0)) OR
    (COLUMN_NAME IN ('DepDelay', 'DepDelayMinutes', 'TaxiOut', 'TaxiIn', 'ArrDelay', 'ArrDelayMinutes', 'CRSElapsedTime', 'ActualElapsedTime', 'AirTime', 'Distance', 'CarrierDelay', 'WeatherDelay', 'NASDelay', 'SecurityDelay', 'LateAircraftDelay', 'TotalAddGTime', 'LongestAddGTime', 'DivActualElapsedTime', 'DivArrDelay', 'DivDistance', 'Div1TotalGTime', 'Div1LongestGTime', 'Div2TotalGTime', 'Div2LongestGTime', 'Div3TotalGTime', 'Div3LongestGTime', 'Div4TotalGTime', 'Div4LongestGTime', 'Div5TotalGTime', 'Div5LongestGTime') AND (DATA_TYPE <> 'NUMBER' OR NUMERIC_PRECISION <> 7 OR NUMERIC_SCALE <> 2)) OR
    (COLUMN_NAME NOT IN ('Year', 'Quarter', 'Month', 'DayofMonth', 'DayOfWeek', 'FlightDate', 'DepDelay', 'DepDelayMinutes', 'DepDel15', 'DepartureDelayGroups', 'TaxiOut', 'TaxiIn', 'ArrDelay', 'ArrDelayMinutes', 'ArrDel15', 'ArrivalDelayGroups', 'Cancelled', 'Diverted', 'CRSElapsedTime', 'ActualElapsedTime', 'AirTime', 'Flights', 'Distance', 'DistanceGroup', 'CarrierDelay', 'WeatherDelay', 'NASDelay', 'SecurityDelay', 'LateAircraftDelay', 'TotalAddGTime', 'LongestAddGTime', 'DivAirportLandings', 'DivReachedDest', 'DivActualElapsedTime', 'DivArrDelay', 'DivDistance', 'Div1TotalGTime', 'Div1LongestGTime', 'Div2TotalGTime', 'Div2LongestGTime', 'Div3TotalGTime', 'Div3LongestGTime', 'Div4TotalGTime', 'Div4LongestGTime', 'Div5TotalGTime', 'Div5LongestGTime') AND DATA_TYPE NOT IN ('TEXT', 'VARCHAR'))
      );

    IF (v_typed_rows <> v_source_rows OR v_typed_columns <> 109 OR v_type_mismatches <> 0) THEN
        RAISE e_candidate_validation;
    END IF;

    RETURN 'Typed candidate created and validated; original table remains unchanged. Review grants and dependencies before manual cutover.';
END;
$$;
