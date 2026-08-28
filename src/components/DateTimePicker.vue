<script setup>
// ==========================================================================
// Frameworks
// ==========================================================================
import { computed, ref } from 'vue'

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
  normalizeIncomingValue,
  parseTypedValue,
  formatHeaderDate,
  formatHeaderTime,
} from '../utils/dateHelpers'

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

  format: { type: [String, Function], default: null },
  minDate: { type: [Date, String], default: null },
  maxDate: { type: [Date, String], default: null },

  // Bounds on the time-of-day portion, independent of minDate/maxDate (e.g.
  // "no bookings before 9am"). Accepts 'HH:mm' for convenience, or vuepic's
  // own { hours, minutes, seconds? } shape.
  minTime: { type: [String, Object], default: null },
  maxTime: { type: [String, Object], default: null },

  minuteInterval: { type: [Number, String], default: 1 },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: null },
  clearable: { type: Boolean, default: true },

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
  if (props.presets === true) return DEFAULT_PRESETS
  if (Array.isArray(props.presets)) return props.presets
  return []
})

const timeConfig = computed(() => ({
  enableTimePicker: enableTimePicker.value,
  minutesIncrement: props.minuteInterval,
}))

const minTimeValue = computed(() => parseTimeBound(props.minTime))
const maxTimeValue = computed(() => parseTimeBound(props.maxTime))

const minDateValue = computed(() => toLocalDate(props.minDate))
const maxDateValue = computed(() => toLocalDate(props.maxDate))

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
// Only override the display format when the consumer asks for one, or when
// typing is enabled — text-input parsing needs a concrete pattern to parse
// against, so we can't leave it to VueDatePicker's internal auto-format
// there the way we do for the read-only calendar-picking flow.
const effectiveFormat = computed(() => {
  if (props.format) return props.format
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
const inputAttrs = computed(() => ({ clearable: props.clearable }))

// A plain JS Date always carries a time-of-day. For onlyDate/onlyTime modes
// that's misleading (a "date only" pick shouldn't silently record the time
// it happened to be clicked), so those modes emit a clean formatted string
// instead of a Date object via modelType.
const modelType = computed(() => {
  if (props.onlyTime) return 'HH:mm'
  if (props.onlyDate) return 'yyyy-MM-dd'
  return undefined
})

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

const headerYear = computed(() => (headerDates.value[0] ?? new Date()).getFullYear())

const headerText = computed(() => {
  const [start, end] = headerDates.value

  if (props.onlyTime) return start ? formatHeaderTime(start) : 'Select time'

  if (props.range) {
    if (!start && !end) return 'Select date range'
    return `${start ? formatHeaderDate(start) : '...'} - ${end ? formatHeaderDate(end) : '...'}`
  }

  if (!start) return 'Select date'
  const dateText = formatHeaderDate(start)
  return enableTimePicker.value ? `${dateText}  ${formatHeaderTime(start)}` : dateText
})

// ==========================================================================
// Refs
// ==========================================================================
const datepickerRef = ref(null)

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
  const now = new Date()
  if (props.onlyTime) {
    modelValue.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  } else if (props.onlyDate) {
    modelValue.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  } else {
    modelValue.value = now
  }
}

// vuepic's own `preset-dates` prop wires clicks to an internal handler that
// emits `select-date` — which, unlike a calendar-cell click's `auto-apply`
// event, ISN'T gated by `config.closeOnAutoApply` and always closes the
// menu. So presets aren't passed to that prop at all (see the template
// below); instead we render our own buttons through the `left-sidebar` slot
// and write straight to our v-model, the same direct-assignment approach
// `selectNow` above already uses — which is why "Now" never auto-closes
// either.
const selectPreset = (preset) => {
  modelValue.value = typeof preset.value === 'function' ? preset.value() : preset.value
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
    @update:model-value="modelValue = $event"
    :time-picker="onlyTime"
    :range="range"
    :inline="inline"
    :time-config="timeConfig"
    :formats="formats"
    :input-attrs="inputAttrs"
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
      <div class="ctk-menu-header">
        <div class="ctk-menu-header-year">{{ headerYear }}</div>
        <div class="ctk-menu-header-value">{{ headerText }}</div>
      </div>
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
/* VueDatePicker's preset buttons render as bare <button class="dp--btn
   dp--preset-range">, and neither class resets native button chrome
   (appearance/background/border/cursor) — so the browser's default grey
   button face shows through. This is global (not scoped) because the
   preset menu is teleported to <body>, outside this component's DOM. */
.dp--preset-dates {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
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
  background-color: var(--dp-hover-color);
  color: var(--dp-hover-text-color);
}

.dp--preset-range:focus-visible {
  outline: 2px solid var(--dp-primary-color);
  outline-offset: -2px;
}

/* Match ctk's confirm control: a plain green checkmark icon instead of a
   filled "Select" text button. This is our own markup rendered through the
   `action-buttons` slot (see the component template), reusing vuepic's own
   ".dp--action-button"/".dp--action-select" classes so it still renders
   inside the library's ".dp--action-buttons" container — keeping this
   selector's specificity matched to vuepic's own rule it overrides
   (`.dp--action-buttons .dp--action-select { background: var(--dp-primary-color) }`). */
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

/* ctk's blue "2018 / Sat 7 Apr / 17:20" banner, rendered through vuepic's
   `menu-header` slot (see the component template) — global because, like
   the preset buttons above, `.dp--menu-header` lives in the menu that's
   teleported to <body>, outside this component's scoped DOM. */
.dp--menu-header {
  padding: 16px 20px;
  background-color: var(--dp-primary-color);
}

.ctk-menu-header-year {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.85rem;
  font-weight: 500;
}

.ctk-menu-header-value {
  color: #fff;
  font-size: 1.2rem;
  font-weight: 600;
  margin-top: 2px;
}
</style>
