-- Grain: one row per year, month, entity type, entity key, and KPI.
-- Counts are staging rows, not deduplicated unique flights. Rankings remain exploratory
-- until minimum-volume and KPI-change thresholds are approved.
with flights as (
    select
        year,
        month,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        try_to_number(to_varchar(cancelled)) as cancelled,
        try_to_number(to_varchar(diverted)) as diverted,
        try_to_number(to_varchar(arrival_delay_15_minutes_or_more))
            as arrival_delay_15_minutes_or_more,
        arrival_delay_minutes,
        carrier_delay_minutes,
        weather_delay_minutes,
        nas_delay_minutes,
        security_delay_minutes,
        late_aircraft_delay_minutes
    from {{ ref('stg_bts_on_time') }}
),

monthly_entities as (
    select
        year,
        month,
        'airline' as entity_type,
        reporting_airline as entity_key,
        reporting_airline,
        cast(null as varchar) as origin_airport_code,
        cast(null as varchar) as destination_airport_code,
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
        sum(case when cancelled = 0 then arrival_delay_minutes end) as total_arrival_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then carrier_delay_minutes end) as carrier_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then weather_delay_minutes end) as weather_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then nas_delay_minutes end) as nas_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then security_delay_minutes end) as security_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then late_aircraft_delay_minutes end) as late_aircraft_delay_minutes
    from flights
    where reporting_airline is not null
    group by year, month, reporting_airline

    union all

    select
        year,
        month,
        'origin_airport' as entity_type,
        origin_airport_code as entity_key,
        cast(null as varchar) as reporting_airline,
        origin_airport_code,
        cast(null as varchar) as destination_airport_code,
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
        sum(case when cancelled = 0 then arrival_delay_minutes end) as total_arrival_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then carrier_delay_minutes end) as carrier_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then weather_delay_minutes end) as weather_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then nas_delay_minutes end) as nas_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then security_delay_minutes end) as security_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then late_aircraft_delay_minutes end) as late_aircraft_delay_minutes
    from flights
    where origin_airport_code is not null
    group by year, month, origin_airport_code

    union all

    select
        year,
        month,
        'destination_airport' as entity_type,
        destination_airport_code as entity_key,
        cast(null as varchar) as reporting_airline,
        cast(null as varchar) as origin_airport_code,
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
        sum(case when cancelled = 0 then arrival_delay_minutes end) as total_arrival_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then carrier_delay_minutes end) as carrier_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then weather_delay_minutes end) as weather_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then nas_delay_minutes end) as nas_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then security_delay_minutes end) as security_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then late_aircraft_delay_minutes end) as late_aircraft_delay_minutes
    from flights
    where destination_airport_code is not null
    group by year, month, destination_airport_code

    union all

    select
        year,
        month,
        'route' as entity_type,
        origin_airport_code || '->' || destination_airport_code as entity_key,
        cast(null as varchar) as reporting_airline,
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
        sum(case when cancelled = 0 then arrival_delay_minutes end) as total_arrival_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then carrier_delay_minutes end) as carrier_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then weather_delay_minutes end) as weather_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then nas_delay_minutes end) as nas_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then security_delay_minutes end) as security_delay_minutes,
        sum(case when cancelled = 0 and diverted = 0 and arrival_delay_15_minutes_or_more = 1
            then late_aircraft_delay_minutes end) as late_aircraft_delay_minutes
    from flights
    where origin_airport_code is not null
        and destination_airport_code is not null
    group by year, month, origin_airport_code, destination_airport_code
),

entity_kpis as (
    select
        year,
        month,
        entity_type,
        entity_key,
        reporting_airline,
        origin_airport_code,
        destination_airport_code,
        staging_row_count,
        'cancellation_rate' as kpi_name,
        'percentage_points' as kpi_unit,
        case when cancelled_status_unknown_rows = 0
            then cancelled_rows / nullif(staging_row_count, 0)::float * 100
        end as kpi_value
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'diversion_rate', 'percentage_points',
        case when diverted_status_unknown_rows = 0
            then diverted_rows / nullif(staging_row_count, 0)::float * 100
        end
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'arrival_delay_rate', 'percentage_points',
        delayed_arrival_rows / nullif(eligible_arrival_rows, 0)::float * 100
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'on_time_rate', 'percentage_points',
        on_time_arrival_rows / nullif(eligible_arrival_rows, 0)::float * 100
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'total_arrival_delay_minutes', 'minutes', total_arrival_delay_minutes
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'carrier_delay_minutes', 'minutes', carrier_delay_minutes
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'weather_delay_minutes', 'minutes', weather_delay_minutes
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'nas_delay_minutes', 'minutes', nas_delay_minutes
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'security_delay_minutes', 'minutes', security_delay_minutes
    from monthly_entities

    union all

    select year, month, entity_type, entity_key, reporting_airline, origin_airport_code, destination_airport_code,
        staging_row_count, 'late_aircraft_delay_minutes', 'minutes', late_aircraft_delay_minutes
    from monthly_entities
),

lagged_kpis as (
    select
        *,
        year * 12 + month as period_index,
        lag(year * 12 + month) over (
            partition by entity_type, entity_key, kpi_name
            order by year, month
        ) as previous_period_index,
        lag(kpi_value) over (
            partition by entity_type, entity_key, kpi_name
            order by year, month
        ) as previous_observed_value
    from entity_kpis
),

compared_kpis as (
    select
        current_kpi.*,
        case
            when current_kpi.previous_period_index = current_kpi.period_index - 1
            then current_kpi.previous_observed_value
        end as previous_month_value,
        previous_year.kpi_value as same_month_last_year_value
    from lagged_kpis as current_kpi
    left join entity_kpis as previous_year
        on previous_year.entity_type = current_kpi.entity_type
        and previous_year.entity_key = current_kpi.entity_key
        and previous_year.kpi_name = current_kpi.kpi_name
        and previous_year.year = current_kpi.year - 1
        and previous_year.month = current_kpi.month
),

kpi_changes as (
    select
        *,
        case when previous_month_value is not null then kpi_value - previous_month_value end
            as month_over_month_change,
        case when same_month_last_year_value is not null then kpi_value - same_month_last_year_value end
            as year_over_year_change
    from compared_kpis
)

select
    year,
    month,
    entity_type,
    entity_key,
    reporting_airline,
    origin_airport_code,
    destination_airport_code,
    kpi_name,
    kpi_unit,
    staging_row_count,
    kpi_value,
    previous_month_value,
    month_over_month_change,
    same_month_last_year_value,
    year_over_year_change,
    case when kpi_value is not null then rank() over (
        partition by year, month, entity_type, kpi_name
        order by
            case when kpi_name = 'on_time_rate' then kpi_value end asc nulls last,
            case when kpi_name <> 'on_time_rate' then kpi_value end desc nulls last
    ) end as current_value_rank,
    case when month_over_month_change is not null then rank() over (
        partition by year, month, entity_type, kpi_name
        order by
            case when kpi_name = 'on_time_rate' then month_over_month_change end asc nulls last,
            case when kpi_name <> 'on_time_rate' then month_over_month_change end desc nulls last
    ) end as month_over_month_change_rank,
    case when year_over_year_change is not null then rank() over (
        partition by year, month, entity_type, kpi_name
        order by
            case when kpi_name = 'on_time_rate' then year_over_year_change end asc nulls last,
            case when kpi_name <> 'on_time_rate' then year_over_year_change end desc nulls last
    ) end as year_over_year_change_rank
from kpi_changes
