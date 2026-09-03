<script setup>
// ==========================================================================
// Frameworks
// ==========================================================================
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// ==========================================================================
// Utilities
// ==========================================================================
import { pad2 } from '../utils/dateHelpers'

// ==========================================================================
// Constants
// ==========================================================================
// Below this width, calendar + time columns side by side would squeeze both
// (see the ".dp--instance-calendar" ResizeObserver below) — stack instead.
const NARROW_BREAKPOINT = 480

// ==========================================================================
// Props
//
// time/updateTime are shaped to drop straight into VueDatePicker's
// `time-picker` slot (see TimePickerSlotProps in
// @vuepic/vue-datepicker's index.d.ts) — DateTimePicker either forwards
// that slot's own props through directly, or adapts the flatter
// `time-picker-overlay` slot's props into this same shape.
// ==========================================================================
const props = defineProps({
  time: { type: Object, required: true },
  updateTime: { type: Function, required: true },
  is24: { type: Boolean, default: true },
  minutesIncrement: { type: [Number, String], default: 1 },
})

// ==========================================================================
// Computed
// ==========================================================================

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Computed: column contents
  //
  // vuepic always stores `time.hours` as a 24-hour value internally, even
  // when displaying 12-hour — is24 only changes what we render, not what we
  // read/write. The 12-hour column is ordered like a real clock face (12,
  // 1, 2, ... 11) rather than numeric order, and each displayed hour maps
  // back to a 24-hour value based on the *current* AM/PM (derived from
  // time.hours, not tracked separately) — same convention vuepic's own
  // default time picker uses internally.
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const period = computed(() => (props.time.hours >= 12 ? 'PM' : 'AM'))

const toActualHour = (displayHour, currentPeriod) => {
  if (currentPeriod === 'AM') return displayHour === 12 ? 0 : displayHour
  return displayHour === 12 ? 12 : displayHour + 12
}

const hourItems = computed(() => {
  if (props.is24) {
    return Array.from({ length: 24 }, (_, h) => ({ value: h, text: pad2(h) }))
  }
  const clockOrder = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  return clockOrder.map((displayHour) => ({
    value: toActualHour(displayHour, period.value),
    text: pad2(displayHour),
  }))
})

const minuteItems = computed(() => {
  const step = Number(props.minutesIncrement) || 1
  const items = []
  for (let m = 0; m < 60; m += step) items.push({ value: m, text: pad2(m) })
  return items
})

// ==========================================================================
// Refs
// ==========================================================================
const rootRef = ref(null)
const hoursColRef = ref(null)
const minutesColRef = ref(null)
const ampmColRef = ref(null)

// ==========================================================================
// Methods
// ==========================================================================
const selectHour = (value) => {
  props.updateTime({ hours: value, minutes: props.time.minutes, seconds: props.time.seconds ?? 0 })
}

const selectMinute = (value) => {
  props.updateTime({ hours: props.time.hours, minutes: value, seconds: props.time.seconds ?? 0 })
}

const selectPeriod = (nextPeriod) => {
  if (nextPeriod === period.value) return
  const delta = nextPeriod === 'PM' ? 12 : -12
  props.updateTime({ hours: props.time.hours + delta, minutes: props.time.minutes, seconds: props.time.seconds ?? 0 })
}

// Keeps the active cell vertically centered in its column, the way a
// picker "wheel" does — computed manually (rather than scrollIntoView) so
// it only ever moves the column itself, never an ancestor. Uses
// getBoundingClientRect rather than offsetTop: vuepic's menu wrapper is
// position:absolute, so offsetTop would resolve against that ancestor
// instead of the scroll container itself.
const centerActive = (colEl, { smooth = false } = {}) => {
  const active = colEl?.querySelector('.time-picker-cell.is-active')
  if (!active || !colEl) return
  const colRect = colEl.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  const offsetWithinCol = activeRect.top - colRect.top + colEl.scrollTop
  const targetScrollTop = offsetWithinCol - colEl.clientHeight / 2 + active.clientHeight / 2
  if (smooth) colEl.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
  else colEl.scrollTop = targetScrollTop
}

// So the first (00) and last (23/59) values can reach the same centered
// position centerActive() targets for everything in between — without this,
// scrollTop clamps at 0 or max and they're stuck flush against the edge
// instead, since there's nothing left to scroll past them.
const applyEdgeSpacers = (colEl) => {
  const firstCell = colEl?.querySelector('.time-picker-cell')
  if (!firstCell) return
  const rowHeight = firstCell.getBoundingClientRect().height
  const spacer = Math.max(0, colEl.clientHeight / 2 - rowHeight / 2)
  colEl.style.paddingTop = `${spacer}px`
  colEl.style.paddingBottom = `${spacer}px`
}

let resizeObserver = null
let instanceCalendarEl = null

// One observer, two jobs: resizing vuepic's own ".dp--instance-calendar"
// (the calendar+time wrapper — reached via closest() since vuepic renders
// it, not us; see the matching CSS in DateTimePicker.vue) toggles the
// narrow/stacked layout; resizing a column recomputes its edge spacers and
// re-centers, since a height change moves where "centered" actually is.
onMounted(() => {
  instanceCalendarEl = rootRef.value?.closest('.dp--instance-calendar')
  const columns = [hoursColRef.value, minutesColRef.value, ampmColRef.value].filter(Boolean)

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === instanceCalendarEl) {
        instanceCalendarEl.classList.toggle('time-picker-narrow', entry.contentRect.width < NARROW_BREAKPOINT)
      } else {
        applyEdgeSpacers(entry.target)
        centerActive(entry.target)
      }
    }
  })

  if (instanceCalendarEl) resizeObserver.observe(instanceCalendarEl)
  columns.forEach((col) => resizeObserver.observe(col))
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  instanceCalendarEl?.classList.remove('time-picker-narrow')
})

watch(() => props.time.hours, () => centerActive(hoursColRef.value, { smooth: true }), { flush: 'post' })
watch(() => props.time.minutes, () => centerActive(minutesColRef.value, { smooth: true }), { flush: 'post' })
watch(period, () => centerActive(ampmColRef.value, { smooth: true }), { flush: 'post' })
</script>

<template>
  <div ref="rootRef" class="time-picker">
    <div ref="hoursColRef" class="time-picker-col">
      <button
        v-for="item in hourItems"
        :key="`h-${item.value}`"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': item.value === time.hours }"
        @click="selectHour(item.value)"
      >{{ item.text }}</button>
    </div>
    <div ref="minutesColRef" class="time-picker-col">
      <button
        v-for="item in minuteItems"
        :key="`m-${item.value}`"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': item.value === time.minutes }"
        @click="selectMinute(item.value)"
      >{{ item.text }}</button>
    </div>
    <div v-if="!is24" ref="ampmColRef" class="time-picker-col time-picker-col-ampm">
      <button
        v-for="p in ['AM', 'PM']"
        :key="p"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': p === period }"
        @click="selectPeriod(p)"
      >{{ p.toLowerCase() }}</button>
    </div>
  </div>
</template>

<style scoped>
.time-picker {
  display: flex;
  height: 232px;
}

.time-picker-col {
  flex: 1;
  min-width: 2.5em;
  overflow-y: auto;
  scrollbar-width: thin;
  /* applyEdgeSpacers() sets padding-top/bottom on this same element via the
     ResizeObserver watching it — border-box keeps that padding inside the
     already-stretched height instead of growing it, which would otherwise
     re-trigger the observer with an ever-larger size on every callback. */
  box-sizing: border-box;
}

.time-picker-col + .time-picker-col {
  border-left: 1px solid var(--dp-border-color);
}

/* Classic (always-visible, non-overlay) scrollbars run ~15-17px wide,
   which on a narrow column eats into the digits themselves — narrow it to
   match vuepic's own overlay scrollbar (".dp--overlay-container"). No
   effect on overlay-style scrollbars (macOS default), which already don't
   reserve layout space. */
.time-picker-col::-webkit-scrollbar {
  width: 5px;
}

.time-picker-col::-webkit-scrollbar-thumb {
  background-color: var(--dp-scroll-bar-color);
  border-radius: 10px;
}

.time-picker-col::-webkit-scrollbar-track {
  background-color: var(--dp-scroll-bar-background);
}

.time-picker-cell {
  display: block;
  width: 100%;
  padding: 7px 0;
  appearance: none;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--dp-font-family);
  font-size: 0.9rem;
  color: var(--dp-text-color);
  text-align: center;
  text-transform: lowercase;
}

.time-picker-cell:hover:not(.is-active) {
  background-color: var(--dp-hover-color);
}

.time-picker-cell.is-active {
  background-color: var(--dp-primary-color);
  color: #fff;
  font-weight: 600;
  border-radius: var(--dp-border-radius);
}
</style>
