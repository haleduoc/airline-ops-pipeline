-- Grain: year + month + reporting airline + origin airport + destination airport.
-- Cause contributions are BTS-reported on qualifying delayed arrivals, not proven root causes.
with delayed_flights as (
    select
        year,
        month,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        arrival_delay_minutes,
        carrier_delay_minutes,
        weather_delay_minutes,
        nas_delay_minutes,
        security_delay_minutes,
        late_aircraft_delay_minutes
    from {{ ref('stg_bts_on_time') }}
    where cancelled = 0
        and diverted = 0
        and arrival_delay_15_minutes_or_more = 1
),

monthly_delay_causes as (
    select
        year,
        month,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        count(*) as delayed_arrival_staging_rows,
        sum(arrival_delay_minutes) as total_arrival_delay_minutes,
        sum(carrier_delay_minutes) as carrier_delay_minutes,
        sum(weather_delay_minutes) as weather_delay_minutes,
        sum(nas_delay_minutes) as nas_delay_minutes,
        sum(security_delay_minutes) as security_delay_minutes,
        sum(late_aircraft_delay_minutes) as late_aircraft_delay_minutes,
        count(carrier_delay_minutes) as carrier_delay_recorded_rows,
        count(weather_delay_minutes) as weather_delay_recorded_rows,
        count(nas_delay_minutes) as nas_delay_recorded_rows,
        count(security_delay_minutes) as security_delay_recorded_rows,
        count(late_aircraft_delay_minutes) as late_aircraft_delay_recorded_rows,
        case
            when count(carrier_delay_minutes) + count(weather_delay_minutes)
                + count(nas_delay_minutes) + count(security_delay_minutes)
                + count(late_aircraft_delay_minutes) = 0
            then null
            else sum(
                coalesce(carrier_delay_minutes, 0)
                + coalesce(weather_delay_minutes, 0)
                + coalesce(nas_delay_minutes, 0)
                + coalesce(security_delay_minutes, 0)
                + coalesce(late_aircraft_delay_minutes, 0)
            )
        end as total_classified_delay_minutes
    from delayed_flights
    group by year, month, reporting_airline, origin_airport_code, destination_airport_code
)

select
    year,
    month,
    reporting_airline,
    origin_airport_code,
    destination_airport_code,
    delayed_arrival_staging_rows,
    total_arrival_delay_minutes,
    carrier_delay_minutes,
    weather_delay_minutes,
    nas_delay_minutes,
    security_delay_minutes,
    late_aircraft_delay_minutes,
    total_classified_delay_minutes,
    carrier_delay_recorded_rows,
    weather_delay_recorded_rows,
    nas_delay_recorded_rows,
    security_delay_recorded_rows,
    late_aircraft_delay_recorded_rows,
    carrier_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as carrier_delay_share,
    weather_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as weather_delay_share,
    nas_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as nas_delay_share,
    security_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as security_delay_share,
    late_aircraft_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as late_aircraft_delay_share
from monthly_delay_causes
