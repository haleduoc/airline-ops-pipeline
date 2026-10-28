-- Grain: one row per year, month, reporting airline, origin airport, and destination airport.
-- Cause minutes are BTS-reported contributions, not proven root causes; late aircraft delay
-- describes the affected flight, not necessarily the original disruption.
with flights as (
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
),

monthly_delay_causes as (
    select
        year,
        month,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        sum(arrival_delay_minutes) as total_arrival_delay_minutes,
        sum(coalesce(carrier_delay_minutes, 0)) as carrier_delay_minutes,
        sum(coalesce(weather_delay_minutes, 0)) as weather_delay_minutes,
        sum(coalesce(nas_delay_minutes, 0)) as nas_delay_minutes,
        sum(coalesce(security_delay_minutes, 0)) as security_delay_minutes,
        sum(coalesce(late_aircraft_delay_minutes, 0)) as late_aircraft_delay_minutes,
        sum(
            coalesce(carrier_delay_minutes, 0)
            + coalesce(weather_delay_minutes, 0)
            + coalesce(nas_delay_minutes, 0)
            + coalesce(security_delay_minutes, 0)
            + coalesce(late_aircraft_delay_minutes, 0)
        ) as total_classified_delay_minutes,
        sum(case when carrier_delay_minutes > 0 then 1 else 0 end) as carrier_delay_rows,
        sum(case when weather_delay_minutes > 0 then 1 else 0 end) as weather_delay_rows,
        sum(case when nas_delay_minutes > 0 then 1 else 0 end) as nas_delay_rows,
        sum(case when security_delay_minutes > 0 then 1 else 0 end) as security_delay_rows,
        sum(case when late_aircraft_delay_minutes > 0 then 1 else 0 end) as late_aircraft_delay_rows
    from flights
    group by year, month, reporting_airline, origin_airport_code, destination_airport_code
)

select
    year,
    month,
    reporting_airline,
    origin_airport_code,
    destination_airport_code,
    total_arrival_delay_minutes,
    carrier_delay_minutes,
    weather_delay_minutes,
    nas_delay_minutes,
    security_delay_minutes,
    late_aircraft_delay_minutes,
    total_classified_delay_minutes,
    carrier_delay_rows,
    weather_delay_rows,
    nas_delay_rows,
    security_delay_rows,
    late_aircraft_delay_rows,
    carrier_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as carrier_delay_share,
    weather_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as weather_delay_share,
    nas_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as nas_delay_share,
    security_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as security_delay_share,
    late_aircraft_delay_minutes / nullif(total_classified_delay_minutes, 0)::float as late_aircraft_delay_share
from monthly_delay_causes
