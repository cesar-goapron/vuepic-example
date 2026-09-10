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

// A free scroll commits whichever cell ends up centered only after this
// many ms of no further scroll movement — ctk's own wheel picker waits for
// the scroll to actually stop rather than acting on every scroll frame.
const SCROLL_SETTLE_DELAY = 200

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

  // Commits whichever cell ends up centered after a free scroll settles
  // (see SCROLL_SETTLE_DELAY/selectCenteredValue below), ctk-style. On by
  // default; set to `false` to make scrolling purely for browsing, leaving
  // click as the only way to select a value.
  selectOnScroll: { type: Boolean, default: true },
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

// Finds whichever cell in colEl sits nearest the column's vertical center —
// the same "centered" position centerActive() scrolls the active cell to —
// and reports its value via onSelect, ctk-style, if it differs from
// currentValue. offsetTop is relative to colEl itself (its nearest
// positioned ancestor, since .time-picker-col is position:relative), so it
// already accounts for applyEdgeSpacers()'s padding without extra math.
const selectCenteredValue = (colEl, values, currentValue, onSelect) => {
  if (!colEl) return
  const targetY = colEl.scrollTop + colEl.clientHeight / 2
  let closestValue = null
  let closestDistance = Infinity
  colEl.querySelectorAll('.time-picker-cell').forEach((cell, index) => {
    const cellCenter = cell.offsetTop + cell.offsetHeight / 2
    const distance = Math.abs(cellCenter - targetY)
    if (distance < closestDistance) {
      closestDistance = distance
      closestValue = values[index]
    }
  })
  if (closestValue !== null && closestValue !== currentValue) onSelect(closestValue)
}

// Debounces selectCenteredValue behind SCROLL_SETTLE_DELAY so it commits
// once scrolling actually stops instead of mid-scroll. getValues/getCurrent
// are thunks (rather than plain values) since hourItems/minuteItems/period
// are computed and can change between when the listener is bound and when
// it eventually fires (e.g. is24 toggling mid-scroll). Checking
// props.selectOnScroll here, rather than skipping the listener entirely
// when it's off, keeps the prop reactive without needing to re-bind on
// change.
const onColumnScrollSettle = (colEl, getValues, getCurrent, onSelect) => {
  let timer = null
  const handler = () => {
    clearTimeout(timer)
    if (!props.selectOnScroll) return
    timer = setTimeout(() => selectCenteredValue(colEl, getValues(), getCurrent(), onSelect), SCROLL_SETTLE_DELAY)
  }
  handler.cancel = () => clearTimeout(timer)
  return handler
}

let resizeObserver = null
let instanceCalendarEl = null
let hoursScrollHandler = null
let minutesScrollHandler = null
let periodScrollHandler = null

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

  hoursScrollHandler = onColumnScrollSettle(
    hoursColRef.value,
    () => hourItems.value.map((item) => item.value),
    () => props.time.hours,
    selectHour,
  )
  minutesScrollHandler = onColumnScrollSettle(
    minutesColRef.value,
    () => minuteItems.value.map((item) => item.value),
    () => props.time.minutes,
    selectMinute,
  )
  periodScrollHandler = onColumnScrollSettle(ampmColRef.value, () => ['AM', 'PM'], () => period.value, selectPeriod)

  hoursColRef.value?.addEventListener('scroll', hoursScrollHandler, { passive: true })
  minutesColRef.value?.addEventListener('scroll', minutesScrollHandler, { passive: true })
  ampmColRef.value?.addEventListener('scroll', periodScrollHandler, { passive: true })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  instanceCalendarEl?.classList.remove('time-picker-narrow')

  hoursScrollHandler?.cancel()
  minutesScrollHandler?.cancel()
  periodScrollHandler?.cancel()
  hoursColRef.value?.removeEventListener('scroll', hoursScrollHandler)
  minutesColRef.value?.removeEventListener('scroll', minutesScrollHandler)
  ampmColRef.value?.removeEventListener('scroll', periodScrollHandler)
})

watch(() => props.time.hours, () => centerActive(hoursColRef.value, { smooth: true }), { flush: 'post' })
watch(() => props.time.minutes, () => centerActive(minutesColRef.value, { smooth: true }), { flush: 'post' })
watch(period, () => centerActive(ampmColRef.value, { smooth: true }), { flush: 'post' })
</script>

<template>
  <div ref="rootRef" class="time-picker">
    <div class="time-borders"></div>
    <div ref="hoursColRef" class="time-picker-col">
      <button
        v-for="item in hourItems"
        :key="`h-${item.value}`"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': item.value === time.hours }"
        @click="selectHour(item.value)"
      ><span class="time-picker-cell-text">{{ item.text }}</span></button>
    </div>
    <div ref="minutesColRef" class="time-picker-col">
      <button
        v-for="item in minuteItems"
        :key="`m-${item.value}`"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': item.value === time.minutes }"
        @click="selectMinute(item.value)"
      ><span class="time-picker-cell-text">{{ item.text }}</span></button>
    </div>
    <div v-if="!is24" ref="ampmColRef" class="time-picker-col time-picker-col-ampm">
      <button
        v-for="p in ['AM', 'PM']"
        :key="p"
        type="button"
        class="time-picker-cell"
        :class="{ 'is-active': p === period }"
        @click="selectPeriod(p)"
      ><span class="time-picker-cell-text">{{ p.toLowerCase() }}</span></button>
    </div>
  </div>
</template>

<style scoped>
.time-picker {
  display: flex;
  height: 232px;
  position: relative;
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
  /* Lets a free scroll (wheel/trackpad/touch) come to rest centered on a
     cell, ctk-wheel-style, instead of wherever momentum happened to stop —
     complements centerActive()'s JS scroll, which handles centering on
     click/value-change rather than on user-driven scrolling. */
  scroll-snap-type: y mandatory;
}

.time-borders {
  position: absolute;
  top: 0;
  bottom: 0;
  margin: auto;
  height: 34px;
  border-color: var(--dp-border-color-hover);
  border-style: solid;
  border-width: 1px 0 1px;
  width: 100%;
  z-index: 1;
  pointer-events: none;
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
  text-align: center;
  text-transform: lowercase;
  scroll-snap-align: center;
  position: relative;
}

/* The animated highlight itself — scales in from nothing on hover/active
   instead of an instant background-color swap. Sized to 70% width like
   ctk's own '.time-picker-column-item-effect', not the full cell, so it
   reads as a pill rather than a full-width block. */
.time-picker-cell::before {
  content: '';
  position: absolute;
  inset: 3px 15%;
  border-radius: var(--dp-border-radius);
  background-color: var(--dp-primary-color);
  opacity: 0;
  transform: scale(0);
  transition: transform 0.45s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.45s cubic-bezier(0.23, 1, 0.32, 1);
  pointer-events: none;
}

.time-picker-cell:hover:not(.is-active)::before {
  transform: scale(1);
  opacity: 0.6;
}

.time-picker-cell.is-active::before {
  transform: scale(1);
  opacity: 1;
}
.time-picker-cell-text {
  position: relative;
  color: var(--dp-text-color);
  transition: color 0.45s cubic-bezier(0.23, 1, 0.32, 1);
}

.time-picker-cell:hover .time-picker-cell-text,
.time-picker-cell.is-active .time-picker-cell-text {
  color: #fff;
}

.time-picker-cell.is-active {
  font-weight: 600;
}
</style>
