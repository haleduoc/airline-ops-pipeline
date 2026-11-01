import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMart, MARTS, periodKey } from './martData'
import './App.css'

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const EMPTY_ROWS = []
const VIEWS = [
  { id: 'airline', label: 'Overview', title: 'Flight Operations Overview', description: 'Airline performance theo tháng và so sánh giữa các hãng.' },
  { id: 'destination', label: 'Destination airports', title: 'Destination Airport Performance', description: 'So sánh dòng staging và tỷ lệ đến trễ theo sân bay đến.' },
  { id: 'causes', label: 'Delay causes', title: 'Reported Delay Contributions', description: 'Các khoản delay do BTS ghi nhận theo hãng và tuyến.' },
  { id: 'departure', label: 'Departure time', title: 'Departure Time Performance', description: 'Tỷ lệ đến trễ theo khung giờ khởi hành dự kiến.' },
  { id: 'priority', label: 'Investigation priority', title: 'Investigation Priority', description: 'Các KPI và thứ hạng được mart xuất theo entity.' },
]

const CAUSE_COLUMNS = [
  ['CARRIER', 'Carrier delay', 'CARRIER_DELAY_MINUTES', 'CARRIER_DELAY_SHARE'],
  ['WEATHER', 'Weather delay', 'WEATHER_DELAY_MINUTES', 'WEATHER_DELAY_SHARE'],
  ['NAS', 'NAS delay', 'NAS_DELAY_MINUTES', 'NAS_DELAY_SHARE'],
  ['SECURITY', 'Security delay', 'SECURITY_DELAY_MINUTES', 'SECURITY_DELAY_SHARE'],
  ['LATE_AIRCRAFT', 'Late aircraft delay', 'LATE_AIRCRAFT_DELAY_MINUTES', 'LATE_AIRCRAFT_DELAY_SHARE'],
]

const KPI_LABELS = {
  arrival_delay_rate: 'Tỷ lệ đến trễ',
  cancellation_rate: 'Tỷ lệ hủy',
  carrier_delay_minutes: 'Phút delay do hãng',
  diversion_rate: 'Tỷ lệ chuyển hướng',
  late_aircraft_delay_minutes: 'Phút delay do máy bay đến trễ',
  nas_delay_minutes: 'Phút delay NAS',
  on_time_rate: 'Tỷ lệ đúng giờ',
  security_delay_minutes: 'Phút delay an ninh',
  total_arrival_delay_minutes: 'Tổng phút đến trễ',
  weather_delay_minutes: 'Phút delay thời tiết',
}

function formatNumber(value) {
  return Number.isFinite(value) ? NUMBER_FORMAT.format(value) : '—'
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'
}

function formatPriorityValue(value, unit) {
  if (!Number.isFinite(value)) return '—'
  const formatted = NUMBER_FORMAT.format(value)
  if (unit === 'percentage_points') return `${formatted} điểm phần trăm`
  if (unit === 'minutes') return `${formatted} phút`
  return `${formatted}${unit ? ` ${unit}` : ''}`
}

function sum(rows, column) {
  return rows.reduce((total, row) => total + (Number.isFinite(row[column]) ? row[column] : 0), 0)
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null
}

function compareNullableDescending(a, b, column, keyColumn) {
  const aValue = a[column]
  const bValue = b[column]
  if (aValue === null && bValue !== null) return 1
  if (bValue === null && aValue !== null) return -1
  if (aValue !== bValue) return bValue - aValue
  return String(a[keyColumn] ?? '').localeCompare(String(b[keyColumn] ?? ''))
}

function buildMonthlyData(rows) {
  const groups = new Map()
  for (const row of rows) {
    const period = periodKey(row)
    groups.set(period, [...(groups.get(period) ?? []), row])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, monthRows]) => {
    const unknownCountsAvailable = monthRows.every((row) => Number.isFinite(row.CANCELLED_STATUS_UNKNOWN_ROWS))
    const cancellationKnown = unknownCountsAvailable && sum(monthRows, 'CANCELLED_STATUS_UNKNOWN_ROWS') === 0
    return {
      period,
      arrivalDelayRate: ratio(sum(monthRows, 'DELAYED_ARRIVAL_ROWS'), sum(monthRows, 'ELIGIBLE_ARRIVAL_ROWS')),
      onTimeRate: ratio(sum(monthRows, 'ON_TIME_ARRIVAL_ROWS'), sum(monthRows, 'ELIGIBLE_ARRIVAL_ROWS')),
      cancellationRate: cancellationKnown
        ? ratio(sum(monthRows, 'CANCELLED_ROWS'), sum(monthRows, 'STAGING_ROW_COUNT'))
        : null,
    }
  })
}

function TrendChart({ data }) {
  const chartFrame = useRef(null)
  const [width, setWidth] = useState(760)
  const height = 300
  const left = 54
  const right = 12
  const top = 18
  const bottom = 58
  const plotHeight = height - top - bottom
  const plotWidth = width - left - right
  const x = (index) => left + (data.length === 1 ? plotWidth / 2 : (index * plotWidth) / (data.length - 1))
  const y = (value) => top + (1 - value) * plotHeight
  const series = [
    { key: 'arrivalDelayRate', label: 'Đến trễ', color: '#174b83' },
    { key: 'onTimeRate', label: 'Đúng giờ', color: '#71808e' },
    { key: 'cancellationRate', label: 'Hủy', color: '#9a6a2d' },
  ]
  const cancellationAvailable = data.every((month) => Number.isFinite(month.cancellationRate))
  const visibleSeries = series.filter(({ key }) => key !== 'cancellationRate' || cancellationAvailable)

  useEffect(() => {
    const element = chartFrame.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width)
      if (nextWidth > 0) setWidth((current) => nextWidth === current ? current : nextWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="section-heading">
        <div><h2 id="trend-title">Xu hướng 5 tháng</h2><p>Tỷ lệ đến trễ và đúng giờ, gộp theo từng tháng.</p></div>
      </div>
      <div className="chart-frame" ref={chartFrame}>
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="chart-title chart-description">
          <title id="chart-title">Tỷ lệ đến trễ và đúng giờ theo tháng</title>
          <desc id="chart-description">Tỷ lệ được tính bằng tổng số dòng tương ứng chia cho tổng số dòng đủ điều kiện đến từng tháng.</desc>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end" className="chart-axis-label">{Math.round(tick * 100)}%</text>
            </g>
          ))}
          <text x="14" y={top + plotHeight / 2} transform={`rotate(-90 14 ${top + plotHeight / 2})`} textAnchor="middle" className="chart-axis-title">Tỷ lệ (%)</text>
          {visibleSeries.map(({ key, color }) => {
            const points = data.filter((month) => Number.isFinite(month[key]))
            if (!points.length) return null
            const path = points.map((month) => {
              const index = data.indexOf(month)
              return `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(month[key])}`
            }).join(' ')
            return <path key={key} d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          })}
          {data.map((month, index) => (
            <text key={month.period} x={x(index)} y={height - 34} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} className="chart-axis-label">
              {`${month.period.slice(5)}/${month.period.slice(2, 4)}`}
            </text>
          ))}
          <text x={left + plotWidth / 2} y={height - 5} textAnchor="middle" className="chart-axis-title">Tháng</text>
        </svg>
      </div>
      <div className="chart-legend" aria-label="Chú giải biểu đồ">
        {visibleSeries.map(({ key, label, color }) => <span className="legend-item" key={key}><span className="legend-swatch" style={{ '--series-color': color }} />{label}</span>)}
      </div>
      {!cancellationAvailable && <p className="chart-note">Tỷ lệ hủy chưa được xác nhận đầy đủ trong CSV.</p>}
    </section>
  )
}

function FilterSelect({ label, value, onChange, options, allowAll = true }) {
  return (
    <label className="data-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowAll && <option value="">Tất cả</option>}
        {options.map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Pagination({ page, pageCount, onChange, totalRows }) {
  if (pageCount <= 1) return <p className="result-count">{NUMBER_FORMAT.format(totalRows)} dòng</p>
  return (
    <div className="pagination" aria-label="Phân trang">
      <span>{NUMBER_FORMAT.format(totalRows)} dòng · trang {page + 1}/{pageCount}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}>Trước</button>
        <button type="button" onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>Sau</button>
      </div>
    </div>
  )
}

function PaginatedRows({ rows, columns, rowKey, onSelect, selectedKey, tableClass = '' }) {
  const [page, setPage] = useState(0)
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize)

  function renderValue(row, column) {
    return column.render ? column.render(row[column.key], row) : row[column.key] ?? '—'
  }

  if (!rows.length) return <div className="empty-notice">Không có dòng dữ liệu cho kỳ và bộ lọc đang chọn.</div>

  return (
    <>
      <div className="table-scroll">
        <table className={tableClass}>
          <thead><tr>{columns.map((column) => <th className={column.numeric ? 'numeric-cell' : ''} scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = rowKey(row)
              const selected = key === selectedKey
              return (
                <tr className={selected ? 'is-selected' : ''} key={key}>
                  {columns.map((column, index) => (
                    index === 0 && onSelect
                      ? <th scope="row" key={column.key}><button className="row-select" type="button" aria-pressed={selected} onClick={() => onSelect(key)}>{renderValue(row, column)}</button></th>
                      : index === 0
                        ? <th scope="row" key={column.key}>{renderValue(row, column)}</th>
                        : <td className={column.numeric ? 'numeric-cell' : ''} key={column.key}>{renderValue(row, column)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="data-cards">
        {visibleRows.map((row) => {
          const key = rowKey(row)
          const selected = key === selectedKey
          return (
            <article className={`data-card${selected ? ' is-selected' : ''}`} key={key}>
              <h3>
                {onSelect
                  ? <button className="row-select" type="button" aria-pressed={selected} onClick={() => onSelect(key)}>{renderValue(row, columns[0])}</button>
                  : renderValue(row, columns[0])}
              </h3>
              <dl>{columns.slice(1).map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{renderValue(row, column)}</dd></div>)}</dl>
            </article>
          )
        })}
      </div>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} totalRows={rows.length} />
    </>
  )
}

function AirlineRanking({ rows, scale, selectedAirline, onToggleAirline }) {
  const sortedRows = rows.slice().sort((a, b) => compareNullableDescending(a, b, 'ARRIVAL_DELAY_RATE', 'REPORTING_AIRLINE'))

  return (
    <section className="panel ranking-panel" aria-labelledby="ranking-title">
      <div className="section-heading"><div><h2 id="ranking-title">Tỷ lệ đến trễ theo hãng</h2><p>Trong kỳ đang chọn · cao nhất trước</p></div></div>
      <div className="ranking-axis" aria-hidden="true"><span /><div className="ranking-axis-track"><span style={{ left: 0 }}>0%</span><span style={{ left: '50%' }}> {formatRate(scale / 2)}</span><span style={{ left: '100%' }}>{formatRate(scale)}</span></div></div>
      <div className="ranking-list" role="list">
        {sortedRows.map((row, index) => {
          const selected = selectedAirline === row.REPORTING_AIRLINE
          return (
            <div className={`ranking-item${selected ? ' is-selected' : ''}`} role="listitem" key={row.REPORTING_AIRLINE}>
              <span className="ranking-position" aria-hidden="true">{index + 1}</span>
              <button className="ranking-button" type="button" aria-pressed={selected} aria-label={`${row.REPORTING_AIRLINE}, tỷ lệ đến trễ ${formatRate(row.ARRIVAL_DELAY_RATE)}`} onClick={() => onToggleAirline(row.REPORTING_AIRLINE)}>
                <span className="ranking-code">{row.REPORTING_AIRLINE}</span>
                <span className="ranking-track" aria-hidden="true"><span className="ranking-bar" style={{ width: `${(row.ARRIVAL_DELAY_RATE / scale) * 100}%` }}><span className="ranking-value">{formatRate(row.ARRIVAL_DELAY_RATE)}</span></span></span>
              </button>
            </div>
          )
        })}
      </div>
      {selectedAirline && <button className="clear-selection" type="button" onClick={() => onToggleAirline(selectedAirline)}>Bỏ chọn {selectedAirline}</button>}
    </section>
  )
}

function AirlineOverview({ rows, selectedPeriod, selectedAirline, setSelectedAirline }) {
  const selectedRows = rows.filter((row) => periodKey(row) === selectedPeriod)
  const sortedRows = selectedRows.slice().sort((a, b) => compareNullableDescending(a, b, 'ARRIVAL_DELAY_RATE', 'REPORTING_AIRLINE'))
  const maxDelayRate = rows.reduce((maximum, row) => Number.isFinite(row.ARRIVAL_DELAY_RATE) ? Math.max(maximum, row.ARRIVAL_DELAY_RATE) : maximum, 0)
  const rankingScale = Math.max(0.1, Math.ceil((maxDelayRate * 100) / 10) * 0.1)
  const totalStaging = sum(selectedRows, 'STAGING_ROW_COUNT')
  const eligible = sum(selectedRows, 'ELIGIBLE_ARRIVAL_ROWS')
  const cancellationKnown = selectedRows.length > 0 && selectedRows.every((row) => Number.isFinite(row.CANCELLED_STATUS_UNKNOWN_ROWS)) && sum(selectedRows, 'CANCELLED_STATUS_UNKNOWN_ROWS') === 0
  const cancellationRate = cancellationKnown ? ratio(sum(selectedRows, 'CANCELLED_ROWS'), totalStaging) : null
  const kpis = [
    { label: 'Dòng staging', value: formatNumber(totalStaging), detail: 'Không phải số chuyến duy nhất' },
    { label: 'Tỷ lệ hủy', value: formatRate(cancellationRate), detail: 'Chỉ tính khi trạng thái hủy đã biết đầy đủ' },
    { label: 'Tỷ lệ đến trễ', value: formatRate(ratio(sum(selectedRows, 'DELAYED_ARRIVAL_ROWS'), eligible)), detail: 'Tổng dòng đến trễ / tổng dòng đủ điều kiện' },
    { label: 'Tỷ lệ đúng giờ', value: formatRate(ratio(sum(selectedRows, 'ON_TIME_ARRIVAL_ROWS'), eligible)), detail: 'Tổng dòng đúng giờ / tổng dòng đủ điều kiện' },
  ]
  const tableColumns = [
    { key: 'REPORTING_AIRLINE', label: 'Hãng' },
    { key: 'STAGING_ROW_COUNT', label: 'Dòng staging', numeric: true, render: formatNumber },
    { key: 'CANCELLATION_RATE', label: 'Tỷ lệ hủy', numeric: true, render: formatRate },
    { key: 'ARRIVAL_DELAY_RATE', label: 'Tỷ lệ đến trễ', numeric: true, render: formatRate },
    { key: 'ON_TIME_RATE', label: 'Tỷ lệ đúng giờ', numeric: true, render: formatRate },
  ]

  return (
    <>
      <section className="panel kpi-grid" aria-label="Chỉ số kỳ được chọn">
        {kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><h2>{kpi.label}</h2><p className="kpi-value">{kpi.value}</p><p className="kpi-detail">{kpi.detail}</p></article>)}
      </section>
      <div className="comparison-grid">
        <AirlineRanking rows={selectedRows} scale={rankingScale} selectedAirline={selectedAirline} onToggleAirline={(code) => setSelectedAirline((current) => current === code ? null : code)} />
        <section className="panel table-panel" aria-labelledby="airline-table-title">
          <div className="section-heading"><div><h2 id="airline-table-title">So sánh hãng hàng không</h2><p>Kỳ {selectedPeriod} · cùng thứ tự với biểu đồ</p></div></div>
          <PaginatedRows key={selectedPeriod} rows={sortedRows} columns={tableColumns} rowKey={(row) => row.REPORTING_AIRLINE} selectedKey={selectedAirline} onSelect={(code) => setSelectedAirline((current) => current === code ? null : code)} tableClass="airline-table" />
        </section>
      </div>
      <TrendChart data={buildMonthlyData(rows)} />
    </>
  )
}

function AirportView({ rows, period }) {
  const tableRows = useMemo(() => rows.filter((row) => periodKey(row) === period).slice().sort((a, b) => compareNullableDescending(a, b, 'ARRIVAL_DELAY_RATE', 'DESTINATION_AIRPORT_CODE')), [rows, period])
  const columns = [
    { key: 'DESTINATION_AIRPORT_CODE', label: 'Sân bay đến' },
    { key: 'SCHEDULED_FLIGHTS', label: 'Dòng staging (SCHEDULED_FLIGHTS)', numeric: true, render: formatNumber },
    { key: 'CANCELLED_FLIGHTS', label: 'Dòng hủy', numeric: true, render: formatNumber },
    { key: 'DELAYED_ARRIVAL_FLIGHTS', label: 'Dòng đến trễ', numeric: true, render: formatNumber },
    { key: 'ELIGIBLE_ARRIVAL_FLIGHTS', label: 'Dòng đủ điều kiện', numeric: true, render: formatNumber },
    { key: 'CANCELLATION_RATE', label: 'Tỷ lệ hủy', numeric: true, render: formatRate },
    { key: 'ARRIVAL_DELAY_RATE', label: 'Tỷ lệ đến trễ', numeric: true, render: formatRate },
  ]
  return (
    <section className="panel data-panel">
      <div className="section-heading"><div><h2>So sánh theo sân bay đến</h2><p>Kỳ {period} · giảm dần theo ARRIVAL_DELAY_RATE</p></div></div>
      <p className="data-note">SCHEDULED_FLIGHTS là COUNT(*) trên staging, không xác nhận số chuyến duy nhất.</p>
      <PaginatedRows key={period} rows={tableRows} columns={columns} rowKey={(row) => row.DESTINATION_AIRPORT_CODE} />
    </section>
  )
}

function CauseBreakdown({ row }) {
  if (!row) return <section className="panel cause-breakdown"><h2>Đóng góp delay được ghi nhận</h2><p>Chọn một dòng trong bảng để xem breakdown.</p></section>
  return (
    <section className="panel cause-breakdown" aria-labelledby="cause-breakdown-title">
      <div className="section-heading"><div><h2 id="cause-breakdown-title">Đóng góp delay được ghi nhận</h2><p>{row.REPORTING_AIRLINE} · {row.ORIGIN_AIRPORT_CODE} → {row.DESTINATION_AIRPORT_CODE}</p></div></div>
      <p className="data-note">Các khoản do BTS ghi nhận; không khẳng định nguyên nhân gốc.</p>
      <div className="cause-list">
        {CAUSE_COLUMNS.map(([, label, minutesColumn, shareColumn]) => {
          const share = row[shareColumn]
          return <div className="cause-row" key={shareColumn}><span>{label}</span><span className="cause-track">{Number.isFinite(share) && <span className="cause-bar" style={{ width: `${Math.max(0, Math.min(share, 1)) * 100}%` }} />}</span><strong>{formatRate(share)}</strong><span className="cause-minutes">{formatNumber(row[minutesColumn])} phút</span></div>
        })}
      </div>
      <p className="cause-total">Tổng classified delay: <strong>{formatNumber(row.TOTAL_CLASSIFIED_DELAY_MINUTES)} phút</strong></p>
    </section>
  )
}

function CausesView({ rows, period, filters, updateFilter, selectedKey, setSelectedKey }) {
  const periodRows = useMemo(() => rows.filter((row) => periodKey(row) === period), [rows, period])
  const options = (column) => [...new Set(periodRows.map((row) => row[column]).filter(Boolean))].sort()
  const filteredRows = useMemo(() => periodRows.filter((row) => (!filters.airline || row.REPORTING_AIRLINE === filters.airline) && (!filters.origin || row.ORIGIN_AIRPORT_CODE === filters.origin) && (!filters.destination || row.DESTINATION_AIRPORT_CODE === filters.destination)).slice().sort((a, b) => compareNullableDescending(a, b, 'TOTAL_CLASSIFIED_DELAY_MINUTES', 'DESTINATION_AIRPORT_CODE')), [periodRows, filters])
  const keyFor = (row) => `${row.REPORTING_AIRLINE}|${row.ORIGIN_AIRPORT_CODE}|${row.DESTINATION_AIRPORT_CODE}`
  const selectedRow = filteredRows.find((row) => keyFor(row) === selectedKey) ?? null
  const columns = [
    { key: 'REPORTING_AIRLINE', label: 'Hãng' },
    { key: 'ORIGIN_AIRPORT_CODE', label: 'Sân bay đi' },
    { key: 'DESTINATION_AIRPORT_CODE', label: 'Sân bay đến' },
    { key: 'DELAYED_ARRIVAL_STAGING_ROWS', label: 'Dòng đến trễ', numeric: true, render: formatNumber },
    { key: 'TOTAL_ARRIVAL_DELAY_MINUTES', label: 'Tổng phút đến trễ', numeric: true, render: (value) => formatNumber(value) },
    { key: 'TOTAL_CLASSIFIED_DELAY_MINUTES', label: 'Phút đã phân loại', numeric: true, render: (value) => formatNumber(value) },
  ]
  return (
    <>
      <section className="panel filter-panel" aria-label="Bộ lọc delay causes">
        <FilterSelect label="Hãng" value={filters.airline} onChange={(value) => updateFilter('airline', value)} options={options('REPORTING_AIRLINE')} />
        <FilterSelect label="Sân bay đi" value={filters.origin} onChange={(value) => updateFilter('origin', value)} options={options('ORIGIN_AIRPORT_CODE')} />
        <FilterSelect label="Sân bay đến" value={filters.destination} onChange={(value) => updateFilter('destination', value)} options={options('DESTINATION_AIRPORT_CODE')} />
      </section>
      <CauseBreakdown row={selectedRow} />
      <section className="panel data-panel"><div className="section-heading"><div><h2>Delay contributions theo grain mart</h2><p>Kỳ {period} · chọn dòng để xem breakdown đã xuất</p></div></div><PaginatedRows key={`${period}|${filters.airline}|${filters.origin}|${filters.destination}`} rows={filteredRows} columns={columns} rowKey={keyFor} selectedKey={selectedRow ? keyFor(selectedRow) : null} onSelect={(key) => setSelectedKey((current) => current === key ? null : key)} /></section>
    </>
  )
}

function DepartureChart({ rows }) {
  const blocks = useMemo(() => {
    const groups = new Map()
    rows.forEach((row) => {
      const group = groups.get(row.SCHEDULED_DEPARTURE_TIME_BLOCK) ?? { block: row.SCHEDULED_DEPARTURE_TIME_BLOCK, delayed: 0, onTime: 0, eligible: 0 }
      group.delayed += row.DELAYED_ARRIVAL_ROWS
      group.onTime += row.ON_TIME_ARRIVAL_ROWS
      group.eligible += row.ELIGIBLE_ARRIVAL_ROWS
      groups.set(group.block, group)
    })
    return [...groups.values()].sort((a, b) => a.block.localeCompare(b.block)).map((group) => ({
      ...group,
      delayRate: ratio(group.delayed, group.eligible),
      onTimeRate: ratio(group.onTime, group.eligible),
    }))
  }, [rows])

  return (
    <section className="panel departure-chart" aria-labelledby="departure-chart-title">
      <div className="section-heading"><div><h2 id="departure-chart-title">Tỷ lệ theo khung giờ khởi hành</h2><p>Tổng dòng đến trễ / tổng dòng đủ điều kiện trong khung.</p></div></div>
      {!blocks.length ? <div className="empty-notice">Không có dữ liệu cho kỳ đang chọn.</div> : <div className="departure-bars">{blocks.map((block) => <div className="departure-row" key={block.block}><span className="departure-block">{block.block}</span><span className="departure-track"><span className="departure-bar" style={{ width: `${Math.max(0, Math.min(block.delayRate ?? 0, 1)) * 100}%` }} /></span><strong>{formatRate(block.delayRate)}</strong><span className="departure-ontime">Đúng giờ {formatRate(block.onTimeRate)}</span></div>)}</div>}
    </section>
  )
}

function DepartureView({ rows, period, filters, updateFilter }) {
  const periodRows = useMemo(() => rows.filter((row) => periodKey(row) === period), [rows, period])
  const options = (column) => [...new Set(periodRows.map((row) => row[column]).filter(Boolean))].sort()
  const filteredRows = useMemo(() => periodRows.filter((row) => (!filters.airline || row.REPORTING_AIRLINE === filters.airline) && (!filters.origin || row.ORIGIN_AIRPORT_CODE === filters.origin) && (!filters.destination || row.DESTINATION_AIRPORT_CODE === filters.destination)).slice().sort((a, b) => a.SCHEDULED_DEPARTURE_TIME_BLOCK.localeCompare(b.SCHEDULED_DEPARTURE_TIME_BLOCK) || a.REPORTING_AIRLINE.localeCompare(b.REPORTING_AIRLINE) || a.ORIGIN_AIRPORT_CODE.localeCompare(b.ORIGIN_AIRPORT_CODE) || a.DESTINATION_AIRPORT_CODE.localeCompare(b.DESTINATION_AIRPORT_CODE)), [periodRows, filters])
  const columns = [
    { key: 'SCHEDULED_DEPARTURE_TIME_BLOCK', label: 'Khung giờ' },
    { key: 'REPORTING_AIRLINE', label: 'Hãng' },
    { key: 'ORIGIN_AIRPORT_CODE', label: 'Sân bay đi' },
    { key: 'DESTINATION_AIRPORT_CODE', label: 'Sân bay đến' },
    { key: 'STAGING_ROW_COUNT', label: 'Dòng staging', numeric: true, render: formatNumber },
    { key: 'CANCELLATION_RATE', label: 'Tỷ lệ hủy', numeric: true, render: formatRate },
    { key: 'DIVERSION_RATE', label: 'Tỷ lệ chuyển hướng', numeric: true, render: formatRate },
    { key: 'ARRIVAL_DELAY_RATE', label: 'Tỷ lệ đến trễ', numeric: true, render: formatRate },
    { key: 'ON_TIME_RATE', label: 'Tỷ lệ đúng giờ', numeric: true, render: formatRate },
  ]
  return (
    <>
      <section className="panel filter-panel" aria-label="Bộ lọc departure time">
        <FilterSelect label="Hãng" value={filters.airline} onChange={(value) => updateFilter('airline', value)} options={options('REPORTING_AIRLINE')} />
        <FilterSelect label="Sân bay đi" value={filters.origin} onChange={(value) => updateFilter('origin', value)} options={options('ORIGIN_AIRPORT_CODE')} />
        <FilterSelect label="Sân bay đến" value={filters.destination} onChange={(value) => updateFilter('destination', value)} options={options('DESTINATION_AIRPORT_CODE')} />
      </section>
      <DepartureChart rows={filteredRows} />
      <section className="panel data-panel"><div className="section-heading"><div><h2>Chi tiết theo hãng và tuyến</h2><p>Kỳ {period} · các số đếm là dòng staging</p></div></div><PaginatedRows key={`${period}|${filters.airline}|${filters.origin}|${filters.destination}`} rows={filteredRows} columns={columns} rowKey={(row) => `${row.SCHEDULED_DEPARTURE_TIME_BLOCK}|${row.REPORTING_AIRLINE}|${row.ORIGIN_AIRPORT_CODE}|${row.DESTINATION_AIRPORT_CODE}`} /></section>
    </>
  )
}

function PriorityView({ rows, period, filters, updateFilter }) {
  const periodRows = useMemo(() => rows.filter((row) => periodKey(row) === period), [rows, period])
  const entityTypes = [...new Set(periodRows.map((row) => row.ENTITY_TYPE))].sort()
  const kpiNames = [...new Set(periodRows.filter((row) => !filters.entityType || row.ENTITY_TYPE === filters.entityType).map((row) => row.KPI_NAME))].sort()
  const filteredRows = useMemo(() => periodRows.filter((row) => (!filters.entityType || row.ENTITY_TYPE === filters.entityType) && (!filters.kpiName || row.KPI_NAME === filters.kpiName)).slice().sort((a, b) => {
    const aRank = a.CURRENT_VALUE_RANK
    const bRank = b.CURRENT_VALUE_RANK
    if (aRank === null && bRank !== null) return 1
    if (bRank === null && aRank !== null) return -1
    if (aRank !== bRank) return aRank - bRank
    return a.ENTITY_KEY.localeCompare(b.ENTITY_KEY)
  }), [periodRows, filters])
  const columns = [
    { key: 'ENTITY_KEY', label: 'Entity' },
    { key: 'STAGING_ROW_COUNT', label: 'Dòng staging', numeric: true, render: formatNumber },
    { key: 'KPI_VALUE', label: 'Giá trị', numeric: true, render: (value, row) => formatPriorityValue(value, row.KPI_UNIT) },
    { key: 'CURRENT_VALUE_RANK', label: 'Rank hiện tại', numeric: true, render: formatNumber },
    { key: 'PREVIOUS_MONTH_VALUE', label: 'Giá trị kỳ trước', numeric: true, render: (value, row) => formatPriorityValue(value, row.KPI_UNIT) },
    { key: 'MONTH_OVER_MONTH_CHANGE', label: 'Thay đổi tháng', numeric: true, render: (value, row) => formatPriorityValue(value, row.KPI_UNIT) },
    { key: 'SAME_MONTH_LAST_YEAR_VALUE', label: 'Cùng kỳ năm trước', numeric: true, render: (value, row) => formatPriorityValue(value, row.KPI_UNIT) },
    { key: 'YEAR_OVER_YEAR_CHANGE', label: 'Thay đổi năm', numeric: true, render: (value, row) => formatPriorityValue(value, row.KPI_UNIT) },
    { key: 'MONTH_OVER_MONTH_CHANGE_RANK', label: 'Rank thay đổi tháng', numeric: true, render: formatNumber },
    { key: 'YEAR_OVER_YEAR_CHANGE_RANK', label: 'Rank thay đổi năm', numeric: true, render: formatNumber },
  ]
  return (
    <>
      <section className="panel filter-panel" aria-label="Bộ lọc investigation priority">
        <FilterSelect label="Entity type" value={filters.entityType} onChange={(value) => updateFilter('entityType', value)} options={entityTypes} allowAll={false} />
        <FilterSelect label="KPI" value={filters.kpiName} onChange={(value) => updateFilter('kpiName', value)} options={kpiNames} allowAll={false} />
      </section>
      <p className="data-note priority-note">Rank do mart xuất; kết quả mang tính khám phá cho đến khi xác định ngưỡng volume và thay đổi KPI.</p>
      <section className="panel data-panel"><div className="section-heading"><div><h2>{KPI_LABELS[filters.kpiName] ?? filters.kpiName}</h2><p>Kỳ {period} · {filters.entityType || 'mọi entity type'}</p></div></div><PaginatedRows key={`${period}|${filters.entityType}|${filters.kpiName}`} rows={filteredRows} columns={columns} rowKey={(row) => `${row.ENTITY_TYPE}|${row.ENTITY_KEY}|${row.KPI_NAME}`} /></section>
    </>
  )
}

function App() {
  const [activeView, setActiveView] = useState('airline')
  const [dataCache, setDataCache] = useState({})
  const dataCacheRef = useRef({})
  const inFlightRef = useRef({})
  const retryRequiredRef = useRef({})
  const [loadState, setLoadState] = useState({ airline: 'loading' })
  const [loadError, setLoadError] = useState({})
  const [retryToken, setRetryToken] = useState(0)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedAirline, setSelectedAirline] = useState(null)
  const [selectedCauseKey, setSelectedCauseKey] = useState(null)
  const [filters, setFilters] = useState({
    causes: { airline: '', origin: '', destination: '' },
    departure: { airline: '', origin: '', destination: '' },
    priority: { entityType: 'airline', kpiName: 'arrival_delay_rate' },
  })

  useEffect(() => {
    if (retryRequiredRef.current[activeView]) return
    if (dataCacheRef.current[activeView]) {
      setLoadState((current) => ({ ...current, [activeView]: 'ready' }))
      return
    }
    if (inFlightRef.current[activeView]) return

    setLoadState((current) => ({ ...current, [activeView]: 'loading' }))
    setLoadError((current) => ({ ...current, [activeView]: '' }))
    const request = fetchMart(activeView)
    inFlightRef.current[activeView] = request
    request.then((rows) => {
      dataCacheRef.current[activeView] = rows
      setDataCache((current) => ({ ...current, [activeView]: rows }))
      setLoadState((current) => ({ ...current, [activeView]: 'ready' }))
      const periods = [...new Set(rows.map(periodKey))].sort()
      setSelectedPeriod((current) => periods.includes(current) ? current : periods.at(-1))
    }).catch((error) => {
      retryRequiredRef.current[activeView] = true
      setLoadError((current) => ({ ...current, [activeView]: error instanceof Error ? error.message : 'Lỗi không xác định.' }))
      setLoadState((current) => ({ ...current, [activeView]: 'error' }))
    }).finally(() => {
      inFlightRef.current[activeView] = null
    })
  }, [activeView, retryToken])

  const rows = dataCache[activeView] ?? EMPTY_ROWS
  const periods = useMemo(() => [...new Set(rows.map(periodKey))].sort(), [rows])
  const effectivePeriod = periods.includes(selectedPeriod) ? selectedPeriod : periods.at(-1) ?? ''
  const view = VIEWS.find((item) => item.id === activeView) ?? VIEWS[0]
  const currentLoadState = loadState[activeView] ?? 'loading'

  function updateFilter(viewId, field, value) {
    setFilters((current) => ({ ...current, [viewId]: { ...current[viewId], [field]: value } }))
  }

  function retryActiveView() {
    retryRequiredRef.current[activeView] = false
    setRetryToken((current) => current + 1)
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setActiveView('airline') }} aria-label="Airline Ops home">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v17M8 7h8M5 12h14M2 17h20" /></svg>
          <span>Airline Ops</span>
        </a>
        <label className="mobile-view-select"><span>Mục</span><select aria-label="Mục điều hướng" value={activeView} onChange={(event) => setActiveView(event.target.value)}>{VIEWS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      </header>

      <div className="dashboard-layout">
        <aside className="sidebar" aria-label="Điều hướng chính"><nav>{VIEWS.map((item) => <button className="nav-link" type="button" aria-current={activeView === item.id ? 'page' : undefined} onClick={() => setActiveView(item.id)} key={item.id}>{item.label}</button>)}</nav></aside>
        <main className="main-content">
          <div className="page-heading">
            <div><h1>{view.title}</h1><p className="page-description">{view.description}</p></div>
            {currentLoadState === 'ready' && periods.length > 0 && <label className="period-filter"><span>Kỳ báo cáo</span><select aria-label="Kỳ báo cáo" value={effectivePeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>{periods.map((period) => <option value={period} key={period}>{period}</option>)}</select></label>}
          </div>

          {currentLoadState === 'loading' && <p className="notice" role="status">Đang tải {MARTS[activeView].file}…</p>}
          {currentLoadState === 'error' && <div className="error-notice" role="alert"><p>Không thể đọc dữ liệu từ {MARTS[activeView].file}: {loadError[activeView]}</p><button type="button" onClick={retryActiveView}>Thử lại</button></div>}
          {currentLoadState === 'ready' && rows.length === 0 && <div className="empty-notice">CSV không có dòng dữ liệu.</div>}
          {currentLoadState === 'ready' && rows.length > 0 && (
            <div className="view-content" key={activeView}>
              {activeView === 'airline' && <AirlineOverview rows={rows} selectedPeriod={effectivePeriod} selectedAirline={selectedAirline} setSelectedAirline={setSelectedAirline} />}
              {activeView === 'destination' && <AirportView rows={rows} period={effectivePeriod} />}
              {activeView === 'causes' && <CausesView rows={rows} period={effectivePeriod} filters={filters.causes} updateFilter={(field, value) => updateFilter('causes', field, value)} selectedKey={selectedCauseKey} setSelectedKey={setSelectedCauseKey} />}
              {activeView === 'departure' && <DepartureView rows={rows} period={effectivePeriod} filters={filters.departure} updateFilter={(field, value) => updateFilter('departure', field, value)} />}
              {activeView === 'priority' && <PriorityView rows={rows} period={effectivePeriod} filters={filters.priority} updateFilter={(field, value) => updateFilter('priority', field, value)} />}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
