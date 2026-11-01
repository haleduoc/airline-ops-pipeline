const COMMON_COLUMNS = ['YEAR', 'MONTH']

export const MARTS = {
  airline: {
    file: 'L3_Comsumption_Monthly_AirLines_Performance.csv',
    required: [
      'REPORTING_AIRLINE', 'STAGING_ROW_COUNT', 'CANCELLED_ROWS', 'ELIGIBLE_ARRIVAL_ROWS',
      'DELAYED_ARRIVAL_ROWS', 'ON_TIME_ARRIVAL_ROWS', 'CANCELLATION_RATE',
      'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE',
    ],
    requiredText: ['REPORTING_AIRLINE'],
    numbers: [
      'STAGING_ROW_COUNT', 'CANCELLED_ROWS', 'ELIGIBLE_ARRIVAL_ROWS', 'DELAYED_ARRIVAL_ROWS',
      'ON_TIME_ARRIVAL_ROWS', 'CANCELLATION_RATE', 'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE',
    ],
    nullableNumbers: ['CANCELLATION_RATE', 'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE'],
    nullableText: [],
  },
  destination: {
    file: 'L3_Comsumption_Monthly_Destination_Airport_Performance.csv',
    required: [
      'DESTINATION_AIRPORT_CODE', 'SCHEDULED_FLIGHTS', 'CANCELLED_FLIGHTS',
      'DELAYED_ARRIVAL_FLIGHTS', 'ELIGIBLE_ARRIVAL_FLIGHTS', 'CANCELLATION_RATE',
      'ARRIVAL_DELAY_RATE',
    ],
    requiredText: ['DESTINATION_AIRPORT_CODE'],
    numbers: [
      'SCHEDULED_FLIGHTS', 'CANCELLED_FLIGHTS', 'DELAYED_ARRIVAL_FLIGHTS',
      'ELIGIBLE_ARRIVAL_FLIGHTS', 'CANCELLATION_RATE', 'ARRIVAL_DELAY_RATE',
    ],
    nullableNumbers: ['CANCELLATION_RATE', 'ARRIVAL_DELAY_RATE'],
    nullableText: [],
  },
  causes: {
    file: 'L3_Comsumption_Monthly_Delay_Causes_Performance.csv',
    required: [
      'REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE', 'DESTINATION_AIRPORT_CODE',
      'DELAYED_ARRIVAL_STAGING_ROWS', 'TOTAL_ARRIVAL_DELAY_MINUTES',
      'CARRIER_DELAY_MINUTES', 'WEATHER_DELAY_MINUTES', 'NAS_DELAY_MINUTES',
      'SECURITY_DELAY_MINUTES', 'LATE_AIRCRAFT_DELAY_MINUTES',
      'TOTAL_CLASSIFIED_DELAY_MINUTES', 'CARRIER_DELAY_RECORDED_ROWS',
      'WEATHER_DELAY_RECORDED_ROWS', 'NAS_DELAY_RECORDED_ROWS',
      'SECURITY_DELAY_RECORDED_ROWS', 'LATE_AIRCRAFT_DELAY_RECORDED_ROWS',
      'CARRIER_DELAY_SHARE', 'WEATHER_DELAY_SHARE', 'NAS_DELAY_SHARE',
      'SECURITY_DELAY_SHARE', 'LATE_AIRCRAFT_DELAY_SHARE',
    ],
    requiredText: ['REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE', 'DESTINATION_AIRPORT_CODE'],
    numbers: [
      'DELAYED_ARRIVAL_STAGING_ROWS', 'TOTAL_ARRIVAL_DELAY_MINUTES',
      'CARRIER_DELAY_MINUTES', 'WEATHER_DELAY_MINUTES', 'NAS_DELAY_MINUTES',
      'SECURITY_DELAY_MINUTES', 'LATE_AIRCRAFT_DELAY_MINUTES',
      'TOTAL_CLASSIFIED_DELAY_MINUTES', 'CARRIER_DELAY_RECORDED_ROWS',
      'WEATHER_DELAY_RECORDED_ROWS', 'NAS_DELAY_RECORDED_ROWS',
      'SECURITY_DELAY_RECORDED_ROWS', 'LATE_AIRCRAFT_DELAY_RECORDED_ROWS',
      'CARRIER_DELAY_SHARE', 'WEATHER_DELAY_SHARE', 'NAS_DELAY_SHARE',
      'SECURITY_DELAY_SHARE', 'LATE_AIRCRAFT_DELAY_SHARE',
    ],
    nullableNumbers: [
      'TOTAL_ARRIVAL_DELAY_MINUTES', 'CARRIER_DELAY_MINUTES', 'WEATHER_DELAY_MINUTES',
      'NAS_DELAY_MINUTES', 'SECURITY_DELAY_MINUTES', 'LATE_AIRCRAFT_DELAY_MINUTES',
      'TOTAL_CLASSIFIED_DELAY_MINUTES', 'CARRIER_DELAY_SHARE', 'WEATHER_DELAY_SHARE',
      'NAS_DELAY_SHARE', 'SECURITY_DELAY_SHARE', 'LATE_AIRCRAFT_DELAY_SHARE',
    ],
    nullableText: [],
  },
  departure: {
    file: 'L3_Comsumption_Monthly_Departure_Time_Performance.csv',
    required: [
      'SCHEDULED_DEPARTURE_TIME_BLOCK', 'REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE',
      'DESTINATION_AIRPORT_CODE', 'STAGING_ROW_COUNT', 'CANCELLED_ROWS', 'DIVERTED_ROWS',
      'ELIGIBLE_ARRIVAL_ROWS', 'DELAYED_ARRIVAL_ROWS', 'ON_TIME_ARRIVAL_ROWS',
      'TOTAL_ARRIVAL_DELAY_MINUTES', 'CANCELLATION_RATE', 'DIVERSION_RATE',
      'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE',
    ],
    requiredText: ['SCHEDULED_DEPARTURE_TIME_BLOCK', 'REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE', 'DESTINATION_AIRPORT_CODE'],
    numbers: [
      'STAGING_ROW_COUNT', 'CANCELLED_ROWS', 'DIVERTED_ROWS', 'ELIGIBLE_ARRIVAL_ROWS',
      'DELAYED_ARRIVAL_ROWS', 'ON_TIME_ARRIVAL_ROWS', 'TOTAL_ARRIVAL_DELAY_MINUTES',
      'CANCELLATION_RATE', 'DIVERSION_RATE', 'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE',
    ],
    nullableNumbers: ['TOTAL_ARRIVAL_DELAY_MINUTES', 'CANCELLATION_RATE', 'DIVERSION_RATE', 'ARRIVAL_DELAY_RATE', 'ON_TIME_RATE'],
    nullableText: [],
  },
  priority: {
    file: 'L3_Comsumption_Investigation_Priority_Performance.csv',
    required: [
      'ENTITY_TYPE', 'ENTITY_KEY', 'REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE',
      'DESTINATION_AIRPORT_CODE', 'KPI_NAME', 'KPI_UNIT', 'STAGING_ROW_COUNT',
      'KPI_VALUE', 'PREVIOUS_MONTH_VALUE', 'MONTH_OVER_MONTH_CHANGE',
      'SAME_MONTH_LAST_YEAR_VALUE', 'YEAR_OVER_YEAR_CHANGE', 'CURRENT_VALUE_RANK',
      'MONTH_OVER_MONTH_CHANGE_RANK', 'YEAR_OVER_YEAR_CHANGE_RANK',
    ],
    requiredText: ['ENTITY_TYPE', 'ENTITY_KEY', 'KPI_NAME', 'KPI_UNIT'],
    numbers: [
      'STAGING_ROW_COUNT', 'KPI_VALUE', 'PREVIOUS_MONTH_VALUE', 'MONTH_OVER_MONTH_CHANGE',
      'SAME_MONTH_LAST_YEAR_VALUE', 'YEAR_OVER_YEAR_CHANGE', 'CURRENT_VALUE_RANK',
      'MONTH_OVER_MONTH_CHANGE_RANK', 'YEAR_OVER_YEAR_CHANGE_RANK',
    ],
    nullableNumbers: [
      'KPI_VALUE', 'PREVIOUS_MONTH_VALUE', 'MONTH_OVER_MONTH_CHANGE',
      'SAME_MONTH_LAST_YEAR_VALUE', 'YEAR_OVER_YEAR_CHANGE', 'CURRENT_VALUE_RANK',
      'MONTH_OVER_MONTH_CHANGE_RANK', 'YEAR_OVER_YEAR_CHANGE_RANK',
    ],
    nullableText: ['REPORTING_AIRLINE', 'ORIGIN_AIRPORT_CODE', 'DESTINATION_AIRPORT_CODE'],
  },
}

function periodKey(row) {
  const month = row.MONTH < 10 ? `0${row.MONTH}` : row.MONTH
  return `${row.YEAR}-${month}`
}

function parseCSVLine(line) {
  const fields = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  fields.push(value.trim())
  return fields
}

export function parseMartCSV(text, martId) {
  const schema = MARTS[martId]
  if (!schema) throw new Error(`Không có cấu hình cho mart ${martId}.`)

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) throw new Error('CSV không có dòng dữ liệu.')

  const headers = parseCSVLine(lines[0])
  const required = [...COMMON_COLUMNS, ...schema.required]
  const missing = required.filter((column) => !headers.includes(column))
  if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}.`)

  const numberColumns = [...new Set([...schema.numbers, ...(headers.includes('CANCELLED_STATUS_UNKNOWN_ROWS') ? ['CANCELLED_STATUS_UNKNOWN_ROWS'] : [])])]
  const numberColumnIndexes = numberColumns.map((column) => [headers.indexOf(column), column])
  const textColumnIndexes = schema.nullableText.map((column) => [headers.indexOf(column), column])
  const requiredTextIndexes = schema.requiredText.map((column) => [headers.indexOf(column), column])
  const nullableNumbers = new Set(schema.nullableNumbers)
  const requiredNumberIndexes = numberColumnIndexes.filter(([, column]) => !nullableNumbers.has(column))

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCSVLine(line)
    if (values.length !== headers.length) {
      throw new Error(`Dòng ${rowIndex + 2} có số cột không khớp header.`)
    }

    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    row.YEAR = Number(row.YEAR)
    row.MONTH = Number(row.MONTH)
    if (!Number.isInteger(row.YEAR) || !Number.isInteger(row.MONTH) || row.MONTH < 1 || row.MONTH > 12) {
      throw new Error(`Kỳ không hợp lệ ở dòng ${rowIndex + 2}.`)
    }

    for (const [index, column] of numberColumnIndexes) {
      const rawValue = values[index]
      const value = rawValue === '' ? null : Number(rawValue)
      if (value !== null && !Number.isFinite(value)) {
        throw new Error(`Giá trị ${column} không hợp lệ ở dòng ${rowIndex + 2}.`)
      }
      row[column] = value
    }
    for (const [index, column] of requiredNumberIndexes) {
      if (values[index] === '') throw new Error(`Thiếu giá trị ${column} ở dòng ${rowIndex + 2}.`)
    }
    for (const [index, column] of requiredTextIndexes) {
      if (!values[index]) throw new Error(`Thiếu giá trị ${column} ở dòng ${rowIndex + 2}.`)
    }
    for (const [index, column] of textColumnIndexes) {
      row[column] = values[index] === '' ? null : values[index]
    }
    return row
  })
}

export async function fetchMart(martId) {
  const schema = MARTS[martId]
  const url = `${import.meta.env.BASE_URL}data/${schema.file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Không tải được ${schema.file} (HTTP ${response.status}).`)
  const rows = parseMartCSV(await response.text(), martId)
  if (!rows.length) throw new Error('CSV không có dòng dữ liệu.')
  return rows
}

export { periodKey }
