-- Grain: year + month + scheduled departure time block + airline + origin + destination.
-- Counts are staging rows until a BTS flight key and deduplication rule are confirmed.
with flights as (
    select
        year,
        month,
        scheduled_departure_time_block,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        cancelled,
        diverted,
        arrival_delay_15_minutes_or_more,
        arrival_delay_minutes
    from {{ ref('stg_bts_on_time') }}
),

monthly_time_block as (
    select
        year,
        month,
        scheduled_departure_time_block,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        count(*) as staging_row_count,
        sum(case when cancelled = 1 then 1 else 0 end) as cancelled_rows,
        sum(case when cancelled is null then 1 else 0 end) as cancelled_status_unknown_rows,
        sum(case when diverted = 1 then 1 else 0 end) as diverted_rows,
        sum(case when diverted is null then 1 else 0 end) as diverted_status_unknown_rows,
        sum(case
            when cancelled = 0 and diverted = 0
                and arrival_delay_15_minutes_or_more in (0, 1)
            then 1 else 0
        end) as eligible_arrival_rows,
        sum(case
            when cancelled = 0 and diverted = 0
                and arrival_delay_15_minutes_or_more = 1
            then 1 else 0
        end) as delayed_arrival_rows,
        sum(case
            when cancelled = 0 and diverted = 0
                and arrival_delay_15_minutes_or_more = 0
            then 1 else 0
        end) as on_time_arrival_rows,
        sum(case when cancelled = 0 then arrival_delay_minutes end)
            as total_arrival_delay_minutes
    from flights
    group by
        year,
        month,
        scheduled_departure_time_block,
        reporting_airline,
        origin_airport_code,
        destination_airport_code
)

select
    year,
    month,
    scheduled_departure_time_block,
    reporting_airline,
    origin_airport_code,
    destination_airport_code,
    staging_row_count,
    cancelled_rows,
    diverted_rows,
    eligible_arrival_rows,
    delayed_arrival_rows,
    on_time_arrival_rows,
    total_arrival_delay_minutes,
    case when cancelled_status_unknown_rows = 0
        then cancelled_rows / nullif(staging_row_count, 0)::float
    end as cancellation_rate,
    case when diverted_status_unknown_rows = 0
        then diverted_rows / nullif(staging_row_count, 0)::float
    end as diversion_rate,
    delayed_arrival_rows / nullif(eligible_arrival_rows, 0)::float as arrival_delay_rate,
    on_time_arrival_rows / nullif(eligible_arrival_rows, 0)::float as on_time_rate
from monthly_time_block
