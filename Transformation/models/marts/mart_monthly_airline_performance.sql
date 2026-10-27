with flights as (
    select
        year,
        month,
        reporting_airline,
        flight_date,
        cancelled,
        diverted,
        arrival_delay_15_minutes_or_more
    from {{ ref('stg_bts_on_time') }}
),

monthly_airline as (
    select
        year,
        month,
        reporting_airline,
        count(*) as scheduled_flights,
        sum(case when cancelled = 1 then 1 else 0 end) as cancelled_flights,
        sum(case
            when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then 1 else 0
        end) as delayed_arrival_flights,
        sum(case
            when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more is not null
            then 1 else 0
        end) as eligible_arrival_flights
    from flights
    group by year, month, reporting_airline
)

select
    year,
    month,
    reporting_airline,
    scheduled_flights,
    cancelled_flights,
    delayed_arrival_flights,
    eligible_arrival_flights,
    cancelled_flights / nullif(scheduled_flights, 0)::float as cancellation_rate,
    delayed_arrival_flights / nullif(eligible_arrival_flights, 0)::float as arrival_delay_rate
from monthly_airline