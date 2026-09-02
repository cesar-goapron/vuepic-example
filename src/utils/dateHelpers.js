import { TZDate } from '@date-fns/tz'

// ==========================================================================
// Pure date math — no date library dependency.
// ==========================================================================
export const startOfDay = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const endOfDay = (date) => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export const startOfWeek = (date) => {
  const d = startOfDay(date)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export const endOfWeek = (date) => {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return endOfDay(d)
}

export const startOfMonth = (date) => {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export const endOfMonth = (date) => {
  const d = startOfMonth(date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return endOfDay(d)
}

export const pad2 = (n) => String(n).padStart(2, '0')

// ==========================================================================
// Default range presets ("this week", "next week", etc.). Values are
// getters so they stay fresh across midnight rather than being frozen at
// module-load time.
// ==========================================================================
export const DEFAULT_PRESETS = [
  {
    label: 'Today',
    value: () => [startOfDay(new Date()), endOfDay(new Date())],
  },
  {
    label: 'This Week',
    value: () => [startOfWeek(new Date()), endOfWeek(new Date())],
  },
  {
    label: 'Next Week',
    value: () => {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      return [startOfWeek(nextWeek), endOfWeek(nextWeek)]
    },
  },
  {
    label: 'This Month',
    value: () => [startOfMonth(new Date()), endOfMonth(new Date())],
  },
]

// ==========================================================================
// minDate/maxDate normalization.
//
// vuepic's calendar-cell disabling doesn't reliably honor a plain date
// string (confirmed: cells stayed clickable past the bound even though the
// prop was set correctly) — it needs a real Date instance.
//
// `new Date('2026-08-27')` is NOT safe for that conversion: per spec, a
// bare "yyyy-MM-dd" string is parsed as UTC midnight, not local midnight.
// In any negative-UTC-offset timezone that instant falls on the *previous*
// local day, so a minDate built this way silently allows one extra day
// before the real bound (confirmed: could pick an end date a day before the
// start date). Parse the y/m/d digits ourselves and construct the Date from
// local components instead — this is what onlyDate mode's v-model emits,
// and also what a chained picker's modelValue flows in as.
// ==========================================================================
export const toLocalDate = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  return new Date(value)
}

// ==========================================================================
// minTime/maxTime normalization — accepts 'HH:mm' for convenience, or
// vuepic's own { hours, minutes, seconds? } shape.
// ==========================================================================
export const parseTimeBound = (value) => {
  if (!value) return undefined
  if (typeof value === 'string') {
    const [hours, minutes] = value.split(':').map(Number)
    return { hours, minutes }
  }
  return value
}

// ==========================================================================
// Flexible parsing for values coming from outside our own format defaults —
// e.g. GoApron API responses like "2026-08-28 00:00:00 (EDT)" or
// "8/27/26 23:15". Used both to normalize whatever the consumer's v-model
// ref happens to hold, and (via the wrapper's textInput parser) so pasting
// one of these strings directly into the input works too.
// ==========================================================================
const GOAPRON_DATETIME_TZ = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*\(([A-Za-z]+)\)$/
const GOAPRON_SHORT_DATETIME = /^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/
const GOAPRON_SHORT_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/

// A zone *abbreviation* ("EDT") isn't itself parseable by @date-fns/tz's
// TZDate — it needs an IANA name or a fixed UTC offset. But the abbreviation
// already tells us unambiguously which one is in effect (EST = standard,
// EDT = daylight) — no need to consult an IANA zone's DST rules for a given
// date, just look up the matching fixed offset directly. Extend this if
// GoApron starts reporting airports outside the continental US zones.
const TZ_ABBREVIATION_OFFSETS = {
  EST: '-05:00',
  EDT: '-04:00',
  CST: '-06:00',
  CDT: '-05:00',
  MST: '-07:00',
  MDT: '-06:00',
  PST: '-08:00',
  PDT: '-07:00',
  AKST: '-09:00',
  AKDT: '-08:00',
  HST: '-10:00',
}

// The "(EDT)"/"(EST)" suffix names the zone the wall-clock time was recorded
// in — using @date-fns/tz's TZDate (already a dependency of
// @vuepic/vue-datepicker, which exports it for its own timezone support) to
// resolve that offset into the correct absolute instant, then unwrapping to
// a plain Date via getTime(). A plain Date is what the rest of the wrapper
// (and VueDatePicker) expects: its native getters report in the *browser's*
// local zone, which is what should drive calendar/time display — e.g.
// "23:15 EDT" correctly shows as "20:15" to a viewer on Pacific time, same
// instant either way.
export const parseGoApronFormat = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  let match = GOAPRON_DATETIME_TZ.exec(trimmed)
  if (match) {
    const [, year, month, day, hours, minutes, seconds, abbreviation] = match
    const offset = TZ_ABBREVIATION_OFFSETS[abbreviation.toUpperCase()]
    if (offset) {
      const instant = new TZDate(+year, +month - 1, +day, +hours, +minutes, +seconds, offset)
      return new Date(instant.getTime())
    }
    // Unrecognized abbreviation — fall back to treating it as local time
    // rather than dropping the value entirely.
    return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds)
  }

  match = GOAPRON_SHORT_DATETIME.exec(trimmed)
  if (match) {
    const [, month, day, year, hours, minutes] = match
    return new Date(2000 + Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes))
  }

  match = GOAPRON_SHORT_DATE.exec(trimmed)
  if (match) {
    const [, month, day, year] = match
    return new Date(2000 + Number(year), Number(month) - 1, Number(day))
  }

  return null
}

// Normalizes whatever the consumer's v-model holds before it reaches
// VueDatePicker — a GoApron-style string, our own onlyDate 'yyyy-MM-dd'
// string, or an already-valid Date all resolve to a real local Date.
//
// For onlyDate/onlyTime modes, the result is re-formatted back into the
// same string shape modelType expects ('yyyy-MM-dd' / 'HH:mm') rather than
// left as a Date. This isn't optional: when modelType is set, VueDatePicker
// internally assumes the *external* model-value prop is always a string in
// that format and calls string methods on it directly — feeding it a raw
// Date there throws `dateString.match is not a function` deep inside
// vuepic (confirmed via console error), not a graceful type coercion.
export const normalizeIncomingValue = (value, { onlyDate = false, onlyTime = false } = {}) => {
  if (value == null) return value

  // onlyTime/onlyDate's own modelType round-trips through here on every
  // re-render (this normalizes the wrapper's v-model, which IS that string
  // once a value's been picked) — bare 'HH:mm'/'yyyy-MM-dd' aren't valid
  // `Date` constructor input, so without this guard the fallback below
  // parses them into an Invalid Date and reformats that back into literal
  // "NaN:NaN" / "NaN-NaN-NaN" strings, corrupting both VueDatePicker's own
  // model-value prop and the menu-header banner. Recognize our own
  // already-normalized shape and pass it through untouched.
  if (onlyTime && typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) return value
  if (onlyDate && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  let parsed = value
  if (typeof value === 'string') {
    parsed = parseGoApronFormat(value) || toLocalDate(value)
  }
  if (!(parsed instanceof Date)) return parsed

  if (onlyTime) return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
  if (onlyDate) return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
  return parsed
}

// ==========================================================================
// Menu-header display formatting — mirrors ctk's blue banner (year on one
// line, "Sat 7 Apr" / "17:20" below) and GoApron's own dark-navy variant
// ("2026" / "Aug 28, 2026 - Aug 28, 2026"). Independent of the input's own
// `format`/`formats.input` so the header stays readable regardless of what
// pattern the consumer has the text field parsing.
// ==========================================================================
const HEADER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const formatHeaderDate = (date) => `${HEADER_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

export const formatHeaderTime = (date, is24 = true) => {
  if (is24) return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  const hours24 = date.getHours()
  const period = hours24 >= 12 ? 'pm' : 'am'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${pad2(date.getMinutes())} ${period}`
}

// Custom text-input parser (used for the `editable` prop) so typing OR
// pasting a GoApron-format string works, falling back to whatever format
// the current mode normally expects. `onlyTime` needs today's date filled
// in — a bare "HH:mm" isn't a valid Date on its own — everything else
// parses fine natively.
export const parseTypedValue = (value, { onlyTime = false } = {}) => {
  const goapron = parseGoApronFormat(value)
  if (goapron) return goapron

  if (onlyTime) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const [, hours, minutes] = match
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hours), Number(minutes))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
