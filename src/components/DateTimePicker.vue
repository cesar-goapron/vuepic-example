<script setup>
// ==========================================================================
// Frameworks
// ==========================================================================
import { computed, ref, watch } from 'vue'

// ==========================================================================
// Libraries
// ==========================================================================
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

// ==========================================================================
// Utilities
// ==========================================================================
import {
  DEFAULT_PRESETS,
  pad2,
  parseTimeBound,
  toLocalDate,
  startOfDay,
  normalizeIncomingValue,
  parseTypedValue,
  formatHeaderDate,
  formatHeaderTime,
  translateMomentFormat,
  resolveShortcutValue,
  formatDateWithTokens,
} from '../utils/dateHelpers'

// ==========================================================================
// Components
// ==========================================================================
import TimePicker from './TimePicker.vue'

// ==========================================================================
// Props / Model
// ==========================================================================
const props = defineProps({
  // Mode toggles — mirror vue-ctk-date-time-picker's onlyDate/onlyTime/range
  onlyDate: { type: Boolean, default: false },
  onlyTime: { type: Boolean, default: false },
  range: { type: Boolean, default: false },

  // Standalone/inline mode — renders the calendar always-open with no input,
  // usable alongside any of the modes above.
  inline: { type: Boolean, default: false },

  // `true` turns on the built-in defaults (Today / This Week / Next Week /
  // This Month), an array overrides them entirely, `false` disables presets.
  presets: { type: [Boolean, Array], default: false },

  // ctk-shaped shortcuts — `{ key, label, value }` entries where `value` is
  // a day-offset number, a function returning `[start, end]` Dates, or one
  // of ctk's own DSL strings ('isoWeek'/'month'/'year'/etc., optionally
  // prefixed '-'/'+' — see resolveShortcutValue in dateHelpers.js). Takes
  // precedence over `presets` above when set, so GoApron's real shortcut
  // config (query_filters/date_range_filter.rb's SHORTCUTS_DEFAULT) can be
  // passed straight through unmodified.
  customShortcuts: { type: Array, default: null },

  // ctk-syntax (Moment tokens, e.g. 'YYYY-MM-DD') format for the *stored*
  // v-model value — translated to date-fns tokens and fed to `modelType`.
  // `outputFormat` below overrides this specifically for the value's
  // format, mirroring ctk's own `formatOutput = outputFormat || format`.
  format: { type: String, default: null },
  outputFormat: { type: String, default: null },

  // ctk-syntax (Moment tokens, e.g. 'dddd, MMMM Do YYYY', or a locale macro
  // like 'll') format for how the value is *displayed* in the input —
  // independent of `format`/`outputFormat` above, translated to date-fns
  // tokens and fed to `formats.input`.
  formatted: { type: String, default: null },

  minDate: { type: [Date, String], default: null },
  maxDate: { type: [Date, String], default: null },

  // Bounds on the time-of-day portion, independent of minDate/maxDate (e.g.
  // "no bookings before 9am"). Accepts 'HH:mm' for convenience, or vuepic's
  // own { hours, minutes, seconds? } shape.
  minTime: { type: [String, Object], default: null },
  maxTime: { type: [String, Object], default: null },

  minuteInterval: { type: [Number, String], default: 1 },

  // Caps how many calendar days a range selection can span, ctk-style: if
  // the second click would exceed the cap, the end date is clamped to
  // (start + maxRangeDays - 1) rather than rejected — e.g. maxRangeDays=7,
  // click the 1st then the 25th, and the range becomes the 1st-7th.
  // vuepic's own `maxRange` config (not exposed here) validates instead of
  // clamping — it just disables dates beyond the cap rather than snapping
  // the end date to it, which isn't the ctk behavior being asked for.
  maxRangeDays: { type: [Number, String], default: null },

  // 24-hour vs 12-hour clock. Mirrors vuepic's own TimeConfig default (true).
  is24: { type: Boolean, default: true },

  // 'columns' renders always-visible scrollable hour/minute(/am-pm) columns
  // via the `time-picker` slot, which fully replaces vuepic's own time UI —
  // calendar and time show side by side (see the layout CSS below).
  // 'toggle' instead renders those same columns via the narrower
  // `time-picker-overlay` slot, which keeps vuepic's own calendar/clock
  // toggle button and its click-to-open/closed gating — the calendar and
  // columns are never shown together, only one at a time.
  // 'default' opts out of our columns entirely and falls back to vuepic's
  // own arrows-based time picker (also toggled, same as 'toggle').
  timePickerStyle: {
    type: String,
    default: 'toggle',
    validator: (value) => ['columns', 'toggle', 'default'].includes(value),
  },

  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: null },
  clearable: { type: Boolean, default: true },

  // Forwarded onto the rendered <input> element's id attribute.
  id: { type: String, default: null },

  // Commits the value as soon as a valid selection is clicked, without
  // requiring an explicit Select/checkmark click. On by default; set to
  // `false` to require the extra confirm step.
  autoApply: { type: Boolean, default: true },

  // Shows a "Now" shortcut next to Cancel/Select that fills in the current
  // date/time — the option visible in the ctk reference screenshots.
  showNow: { type: Boolean, default: true },

  // `true` lets the user type or paste a date/time/range directly into the
  // input instead of only picking from the calendar. Pass an object to
  // customize vuepic's TextInputConfig — e.g. `{ rangeSeparator: ' to ' }`
  // or `{ format: ['MM/dd/yyyy', 'MM-dd-yyyy'] }` to accept extra formats.
  editable: { type: [Boolean, Object], default: false },
})

const modelValue = defineModel({ default: null })

// Fires once, when the checkmark is clicked to confirm the pending
// selection — unlike update:modelValue, which (with autoApply on) fires on
// every intermediate click. Lets a consumer chain two pickers together, e.g.
// focusing an "end date" picker as soon as "start date" is confirmed.
const emit = defineEmits(['confirm'])

// ==========================================================================
// Constants
// ==========================================================================
// vuepic skips rendering the action row entirely once autoApply is on
// (nothing left to confirm, in its view) — keepActionRow overrides that so
// our custom Now/checkmark row (see the action-buttons slot below) still
// shows up even while clicks are auto-committing. closeOnAutoApply is
// disabled too, so a single click commits live but the menu stays open
// (letting you keep adjusting date/time) until you click outside or hit
// the checkmark — rather than slamming shut after the first click. Plain
// object, not a computed — neither field derives from props/state.
const config = { keepActionRow: true, closeOnAutoApply: false }

// ==========================================================================
// Computed
// ==========================================================================

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: VueDatePicker prop mappings
  //
  // v14 moved most of these behind nested config objects (timeConfig, formats,
  // inputAttrs) instead of flat props — enableTimePicker/minutesIncrement/
  // clearable/format are NOT top-level props on <VueDatePicker>, they're only
  // read from those nested objects.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const enableTimePicker = computed(() => !props.onlyDate && !props.onlyTime)

const presetDates = computed(() => {
  if (Array.isArray(props.customShortcuts)) return props.customShortcuts
  if (props.presets === true) return DEFAULT_PRESETS
  if (Array.isArray(props.presets)) return props.presets
  return []
})

const timeConfig = computed(() => ({
  enableTimePicker: enableTimePicker.value,
  // minutesIncrement steps vuepic's own arrow buttons; minutesGridIncrement
  // separately steps the clickable overlay list you get from clicking the
  // minute display — vuepic defaults THAT one to 5 regardless of
  // minutesIncrement, which is why 'default' style showed 5-minute steps
  // even though our own columns already respected minuteInterval.
  minutesIncrement: props.minuteInterval,
  minutesGridIncrement: props.minuteInterval,
  is24: props.is24,
}))

// 'columns' lands TimePicker as a sibling of the calendar (see the CSS
// below, which puts them side by side). 'toggle' instead lands it inside
// vuepic's own absolutely-positioned time overlay, which already covers
// the calendar natively — no extra layout work needed there. Range mode
// hands both slots arrays ([startHours, endHours]) instead of plain
// numbers, which TimePicker doesn't handle, so range always falls back to
// vuepic's own default time picker regardless of style.
const useColumnTimePicker = computed(() => props.timePickerStyle === 'columns' && !props.range)
const useToggleTimePicker = computed(() => props.timePickerStyle === 'toggle' && !props.range)

// Adapts the time-picker-overlay slot's flat {hours, minutes, seconds,
// setHours, setMinutes, setSeconds} shape into the {time, updateTime} shape
// TimePicker already expects from the time-picker slot, so the component
// itself doesn't need to know which slot placed it.
const toOverlayUpdateTime = (setHours, setMinutes, setSeconds) => (next) => {
  setHours(next.hours)
  setMinutes(next.minutes)
  setSeconds(next.seconds ?? 0)
}

const minTimeValue = computed(() => parseTimeBound(props.minTime))
const maxTimeValue = computed(() => parseTimeBound(props.maxTime))

const minDateValue = computed(() => toLocalDate(props.minDate))
const maxDateValue = computed(() => toLocalDate(props.maxDate))

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Methods: Range clamping
  //
  // Applied wherever a range value can be written — the calendar-click path
  // (@update:model-value below) and presets (selectPreset below) both go
  // through this, so a preset like "This Month" gets clamped the same way
  // a manual click-past-the-cap would.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const applyMaxRangeDays = (value) => {
  if (!props.range || !props.maxRangeDays || !Array.isArray(value)) return value
  const [start, end] = value
  if (!start || !end) return value

  const startDate = start instanceof Date ? start : toLocalDate(start)
  const endDate = end instanceof Date ? end : toLocalDate(end)
  const maxDays = Number(props.maxRangeDays)
  const spanDays = Math.round((startOfDay(endDate) - startOfDay(startDate)) / 86400000) + 1
  if (spanDays <= maxDays) return value

  const clampedEndDate = new Date(startOfDay(startDate).getTime() + (maxDays - 1) * 86400000)
  // Keep whatever time-of-day the clicked end date had (relevant for a
  // date+time range) — only the date portion is being capped.
  clampedEndDate.setHours(endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), endDate.getMilliseconds())

  const isOnlyDateString = typeof end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end)
  const clampedEnd = isOnlyDateString
    ? `${clampedEndDate.getFullYear()}-${pad2(clampedEndDate.getMonth() + 1)}-${pad2(clampedEndDate.getDate())}`
    : clampedEndDate

  return [start, clampedEnd]
}

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: Value normalization
  //
  // Values coming from outside our own format defaults — e.g. GoApron API
  // responses like "2026-08-28 00:00:00 (EDT)" or "8/27/26 23:15" — are
  // normalized via normalizeIncomingValue/parseTypedValue (utils/dateHelpers.js)
  // so both v-model and pasted/typed text accept them. Range values (arrays)
  // are normalized element-by-element.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const normalizedModelValue = computed(() => {
  const value = modelValue.value
  const options = { onlyDate: props.onlyDate, onlyTime: props.onlyTime }
  return Array.isArray(value)
    ? value.map((item) => normalizeIncomingValue(item, options))
    : normalizeIncomingValue(value, options)
})

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: Text input / editable
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Only override the display format when the consumer asks for one (via
// ctk's `formatted` — Moment syntax, translated below), or when typing is
// enabled — text-input parsing needs a concrete pattern to parse against,
// so we can't leave it to VueDatePicker's internal auto-format there the
// way we do for the read-only calendar-picking flow.
const effectiveFormat = computed(() => {
  if (props.formatted) return translateMomentFormat(props.formatted)
  if (!props.editable) return null
  if (props.onlyTime) return 'HH:mm'
  if (props.onlyDate) return 'MM/dd/yyyy'
  return 'MM/dd/yyyy HH:mm'
})

const formats = computed(() => (effectiveFormat.value ? { input: effectiveFormat.value } : undefined))

// `editable` maps onto vuepic's `textInput` prop. `format` defaults to our
// own flexible parser (handles GoApron strings, this mode's own format, and
// falls back to native Date parsing) so typing/pasting just works; pass an
// object with your own `format` to override it, or other TextInputConfig
// fields (rangeSeparator, maskFormat, enterSubmit/tabSubmit, etc).
const textInput = computed(() => {
  if (!props.editable) return false
  const overrides = typeof props.editable === 'object' ? props.editable : {}
  return { format: (value) => parseTypedValue(value, { onlyTime: props.onlyTime }), ...overrides }
})

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: Display
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const inputAttrs = computed(() => {
  // vuepic's `id` lives under InputAttributesConfig, not as a top-level
  // prop on <VueDatePicker> — same nested-config pattern as clearable.
  const attributes = { clearable: props.clearable }
  if (props.id) attributes.id = props.id
  return attributes
})

// ctk's own `formatOutput = outputFormat || format` fallback — the format
// (Moment syntax) that governs the *stored* v-model value, translated to
// date-fns tokens and fed to `modelType` below. `null` when the consumer
// hasn't set either prop, so the onlyDate/onlyTime hardcoded defaults keep
// applying unchanged.
const valueFormat = computed(() => {
  const momentValueFormat = props.outputFormat || props.format
  return momentValueFormat ? translateMomentFormat(momentValueFormat) : null
})

// Adds a class to vuepic's own ".dp--menu" so the range-only min-width fix
// below (see the global styles) doesn't widen every mode's popup — only
// range has header text long enough to need it.
const uiConfig = computed(() => (props.range ? { menu: 'ctk-menu-range' } : undefined))

// A plain JS Date always carries a time-of-day. For onlyDate/onlyTime modes
// that's misleading (a "date only" pick shouldn't silently record the time
// it happened to be clicked), so those modes emit a clean formatted string
// instead of a Date object via modelType. An explicit `format`/`outputFormat`
// (ctk-syntax, see valueFormat above) takes precedence over those
// hardcoded defaults — this is what lets full date+time mode also emit a
// formatted string instead of a Date, matching ctk's own always-formatted
// behavior, when the consumer opts in.
const modelType = computed(() => {
  if (valueFormat.value) return valueFormat.value
  if (props.onlyTime) return 'HH:mm'
  if (props.onlyDate) return 'yyyy-MM-dd'
  return undefined
})

// selectPreset/selectNow below write directly to modelValue.value rather
// than going through VueDatePicker's own @update:model-value (which
// applies modelType formatting internally before it ever reaches us) — so
// a raw Date coming from either of those needs the same modelType-aware
// string coercion applied by hand. Recurses over range arrays; passes
// through anything that isn't a Date unchanged (already-formatted strings,
// or a Date when modelType isn't set, i.e. plain date+time mode).
const formatForModelType = (value) => {
  if (!modelType.value) return value
  if (Array.isArray(value)) return value.map(formatForModelType)
  if (value instanceof Date) return formatDateWithTokens(value, modelType.value)
  return value
}

const computedPlaceholder = computed(() => {
  if (props.placeholder) return props.placeholder
  if (props.onlyTime) return 'Select time'
  if (props.range) return 'Select date range'
  return 'Select date'
})

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: Menu header (ctk-style banner)
  //
  // Reads off normalizedModelValue rather than the raw v-model — it's
  // already resolved to real Date instances (or onlyDate/onlyTime strings),
  // so the header doesn't need to re-parse GoApron-style seed strings. With
  // autoApply on (the default), the wrapper's own v-model already updates on
  // every intermediate click — see handleSelectClick above — so this banner
  // tracks the pending selection live, the same way ctk's does, with no
  // extra wiring.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const toHeaderDate = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (props.onlyTime) {
    const [hours, minutes] = value.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return date
  }
  return toLocalDate(value)
}

const headerDates = computed(() => {
  const raw = normalizedModelValue.value
  if (props.range) {
    const [start, end] = Array.isArray(raw) ? raw : [null, null]
    return [toHeaderDate(start), toHeaderDate(end)]
  }
  return [toHeaderDate(raw)]
})

// No year line in onlyTime mode — there's no date context to hang a year
// off of, and showing today's year next to a bare time reads as a mistake
// rather than useful information.
const headerYear = computed(() => {
  if (props.onlyTime) return null
  return (headerDates.value[0] ?? new Date()).getFullYear()
})

const headerText = computed(() => {
  const [start, end] = headerDates.value

  if (props.onlyTime) return start ? formatHeaderTime(start, props.is24) : 'Select time'

  if (props.range) {
    if (!start && !end) return 'Select date range'
    return `${start ? formatHeaderDate(start) : '...'} - ${end ? formatHeaderDate(end) : '...'}`
  }

  if (!start) return 'Select date'
  const dateText = formatHeaderDate(start)
  return enableTimePicker.value ? `${dateText}  ${formatHeaderTime(start, props.is24)}` : dateText
})

// ==========================================================================
// Refs
// ==========================================================================
const datepickerRef = ref(null)

// VueDatePicker only re-renders the *closed* input's displayed text off its
// own internal state changes (a new selection, opening/closing the menu) —
// changing `formats.input` (driven by `effectiveFormat`, e.g. via the
// `formatted` prop) while the menu is closed doesn't retrigger that
// internal render, so the label blanks out until something else (like
// focusing the input) forces it to recompute.
watch(effectiveFormat, () => datepickerRef.value?.parseModel(), { flush: 'post' })

// ==========================================================================
// Methods
//
// Custom action row (Cancel / Now / Select-as-checkmark). vuepic's
// `action-buttons` slot replaces the whole button group as a unit (there's
// no way to override just the Select button) and only hands back
// { value, selectDate, selectionDisabled } — no close/now handles. Cancel is
// wired through the exposed `closeMenu()` method on the VueDatePicker
// instance instead (via template ref); Now is implemented directly against
// our own v-model rather than vuepic's internal pending-selection state,
// which isn't reachable from this slot.
// ==========================================================================
const selectNow = () => {
  modelValue.value = formatForModelType(new Date())
}

// vuepic's own `preset-dates` prop wires clicks to an internal handler that
// emits `select-date` — which, unlike a calendar-cell click's `auto-apply`
// event, ISN'T gated by `config.closeOnAutoApply` and always closes the
// menu. So presets aren't passed to that prop at all (see the template
// below); instead we render our own buttons through the `left-sidebar` slot
// and write straight to our v-model, the same direct-assignment approach
// `selectNow` above already uses — which is why "Now" never auto-closes
// either.
const resolvePresetValue = (presetValue) => {
  if (typeof presetValue === 'function') return presetValue()
  // ctk's own shortcut DSL — a day-offset number or a unit string like
  // 'isoWeek'/'-month' (see resolveShortcutValue in dateHelpers.js). Falls
  // back to the raw value when it isn't recognized, preserving the
  // existing plain-Date-pair-array preset shape some `presets` entries use
  // directly.
  if (typeof presetValue === 'number' || typeof presetValue === 'string') {
    return resolveShortcutValue(presetValue) ?? presetValue
  }
  return presetValue
}

const selectPreset = (preset) => {
  const resolvedValue = resolvePresetValue(preset.value)
  modelValue.value = formatForModelType(applyMaxRangeDays(resolvedValue))
}

const handleSelectClick = (selectDate) => {
  selectDate()
  // With autoApply on, vuepic's own "should this close?" logic is gated by
  // closeOnAutoApply (which we set false so a single click doesn't slam the
  // menu shut) — but that same gate also swallows the checkmark's own close,
  // since both paths funnel through the same autoApply-aware confirm logic.
  // Force it explicitly so the checkmark always closes regardless.
  datepickerRef.value?.closeMenu()
  emit('confirm', modelValue.value)
}

// ==========================================================================
// Expose
//
// vuepic's own menu controls, so two instances can be chained together —
// e.g. a "start date" picker calling `endPickerRef.openMenu()` from its own
// @confirm handler to focus the "end date" picker.
// ==========================================================================
defineExpose({
  openMenu: () => datepickerRef.value?.openMenu(),
  closeMenu: () => datepickerRef.value?.closeMenu(),
})
</script>

<template>
  <VueDatePicker
    ref="datepickerRef"
    :model-value="normalizedModelValue"
    @update:model-value="modelValue = applyMaxRangeDays($event)"
    :time-picker="onlyTime"
    :range="range"
    :inline="inline"
    :time-config="timeConfig"
    :formats="formats"
    :input-attrs="inputAttrs"
    :ui="uiConfig"
    :text-input="textInput"
    :model-type="modelType"
    :min-date="minDateValue"
    :max-date="maxDateValue"
    :min-time="minTimeValue"
    :max-time="maxTimeValue"
    :disabled="disabled"
    :placeholder="computedPlaceholder"
    :auto-apply="autoApply"
    :config="config"
    six-weeks="center"
  >
    <template #menu-header>
      <div class="ga-dp-menu-header">
        <div v-if="headerYear !== null" class="ga-dp-menu-header-year">{{ headerYear }}</div>
        <div class="ga-dp-menu-header-value">{{ headerText }}</div>
      </div>
    </template>

    <template v-if="useColumnTimePicker" #time-picker="{ time, updateTime }">
      <TimePicker :time="time" :update-time="updateTime" :is24="is24" :minutes-increment="minuteInterval" />
    </template>

    <template
      v-if="useToggleTimePicker"
      #time-picker-overlay="{ hours, minutes, seconds, setHours, setMinutes, setSeconds }"
    >
      <TimePicker
        :time="{ hours, minutes, seconds }"
        :update-time="toOverlayUpdateTime(setHours, setMinutes, setSeconds)"
        :is24="is24"
        :minutes-increment="minuteInterval"
      />
    </template>

    <template v-if="presetDates.length" #left-sidebar>
      <div class="dp--preset-dates">
        <button
          v-for="preset in presetDates"
          :key="preset.label"
          type="button"
          class="dp--btn dp--preset-range"
          @click="selectPreset(preset)"
        >
          {{ preset.label }}
        </button>
      </div>
    </template>

    <template #action-buttons="{ selectDate, selectionDisabled }">
      <button
        v-if="!inline && !autoApply"
        type="button"
        class="dp--action-button dp--action-cancel"
        @click="datepickerRef?.closeMenu()"
      >
        Cancel
      </button>
      <button
        v-if="showNow && !range"
        type="button"
        class="dp--action-button dp--action-cancel"
        @click="selectNow"
      >
        Now
      </button>
      <button
        type="button"
        class="dp--action-button dp--action-select"
        aria-label="Select"
        :disabled="selectionDisabled"
        @click="handleSelectClick(selectDate)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e9e4f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 12 9 18 20 6" />
        </svg>
      </button>
    </template>
  </VueDatePicker>
</template>

<style>
.dp--theme-light,
.dp--theme-dark {
  /* --dp-primary-color: #192f4d; */
  --dp-icon-color: #192f4d;
  --dp-hover-icon-color: #397fdb;
  --dp-range-between-dates-background-color: #b0ccf1;
  --dp-range-between-border-color: transparent;
}

.dp--today {
  border-color: #397fdb;
}

.dp--instance-calendar:has(.time-picker):not(:has(.dp--overlay-container)) {
  display: flex;
  align-items: stretch;
}

.dp--instance-calendar:has(.time-picker):not(:has(.dp--overlay-container))
  > div:last-child:not(:only-child) {
  border-inline-start: 1px solid var(--dp-border-color);
}


.dp--overlay-container.dp--time-picker-overlay-container .time-picker {
  height: calc(100% - var(--dp-button-height));
}

.dp--instance-calendar.time-picker-narrow {
  flex-direction: column;

  align-items: stretch;
}

.dp--instance-calendar.time-picker-narrow > div:last-child:not(:only-child) {
  border-inline-start: none;
  border-top: 1px solid var(--dp-border-color);
}

.dp--preset-dates {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-inline-end: none;
}

.dp--preset-range {
  appearance: none;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--dp-font-family);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--dp-text-color);
  border-radius: var(--dp-border-radius);
  padding: 8px 12px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.dp--preset-range:hover {
  background-color: var(--dp-primary-color);
  color: #fff;
}

.dp--preset-range:focus-visible {
  outline: 2px solid var(--dp-primary-color);
  outline-offset: -2px;
}

.dp--action-buttons .dp--action-select {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  background-color: transparent;
}

.dp--action-buttons .dp--action-select svg {
  display: block;
  pointer-events: none;
}

.dp--action-buttons .dp--action-select:hover:not(:disabled) {
  background-color: var(--dp-hover-color);
}

.dp--action-buttons .dp--action-select:focus-visible {
  outline: 2px solid var(--dp-primary-color);
  outline-offset: 1px;
}

.dp--action-buttons .dp--action-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dp--menu-header {
  padding: 10px 0px 10px 10px;
  background-color: #192f4d;
}

.dp--arrow-top {
  display: none;
}
.ga-dp-menu-header {
  line-height: 1.2;
}
.ga-dp-menu-header-year,
.ga-dp-menu-header-value {
  color: rgba(255, 255, 255, 0.8);
  font-family: 'museo-sans', Arial, sans-serif;
  font-weight: 700;
}

.ga-dp-menu-header-year {
  font-size: 14px;

  opacity: 0.7;
}

.ga-dp-menu-header-value {
  font-size: 18px;
  margin-top: 2px;
  letter-spacing: normal;
}
</style>
