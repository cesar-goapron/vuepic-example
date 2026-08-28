<script setup>
// ==========================================================================
// Frameworks
// ==========================================================================
import { ref } from 'vue'

// ==========================================================================
// Components
// ==========================================================================
import DateTimePicker from './components/DateTimePicker.vue'
import PlaygroundCard from './components/PlaygroundCard.vue'

// ==========================================================================
// Refs
// ==========================================================================
const dateTimeValue = ref(null)
const dateOnlyValue = ref(null)
const timeOnlyValue = ref(null)
const rangePresetValue = ref(null)
const inlineValue = ref(null)
const editableValue = ref(null)

const startValue = ref(null)
const endValue = ref(null)
const endPickerRef = ref(null)

const startTimeValue = ref(null)
const endTimeValue = ref(null)
const endTimePickerRef = ref(null)

const gaValue = ref('2026-08-27 23:15:00 (EDT)')

// ==========================================================================
// Methods
// ==========================================================================
const onStartConfirm = () => {
  endPickerRef.value?.openMenu()
}

const onStartTimeConfirm = () => {
  endTimePickerRef.value?.openMenu()
}
</script>

<template>
  <main class="playground">
    <header class="playground-header">
      <h1>DateTimePicker Wrapper Example</h1>
      <br/>
      <p>
        A <code>@vuepic/vue-datepicker</code> wrapper modeled to feel & behave like
        <code>vue-ctk-date-time-picker</code>'s <code>onlyDate</code> /
        <code>onlyTime</code> / <code>range</code> / <code>presets</code> API.
      </p>
    </header>

    <div class="playground-grid">
      <PlaygroundCard
        title="Date + Time Picker"
        description="Default mode — pick a single date and time"
        :value="dateTimeValue"
      >
        <DateTimePicker v-model="dateTimeValue"/>
      </PlaygroundCard>

      <PlaygroundCard
        title="Date Only Picker"
        description="onlyDate disables the time picker entirely."
        :value="dateOnlyValue"
      >
        <DateTimePicker v-model="dateOnlyValue" only-date />
      </PlaygroundCard>

      <PlaygroundCard
        title="Time Only Picker"
        description="onlyTime switches to a standalone time picker. With min and max times set."
        :value="timeOnlyValue"
      >
        <DateTimePicker v-model="timeOnlyValue" only-time editable min-time="08:00" max-time="22:00" />
      </PlaygroundCard>

      <PlaygroundCard
        title="Editable Date Range w/ Presets"
        description="date only range with presets. Enables Today | This Week | Next Week | This Month shortcuts. 
        Also editable — try pasting '08/01/2026 - 08/31/2026'."
        :value="rangePresetValue"
      >
        <DateTimePicker v-model="rangePresetValue" range presets editable only-date />
      </PlaygroundCard>

      <PlaygroundCard
        title="Standalone (Inline) Mode"
        description="inline renders the calendar always-open, no input — usable alongside any other mode."
        :value="inlineValue"
      >
        <DateTimePicker v-model="inlineValue" inline />
      </PlaygroundCard>

      <PlaygroundCard
        title="Editable Input"
        description="editable lets you type or paste a value directly instead of only picking from the calendar."
        :value="editableValue"
      >
        <DateTimePicker v-model="editableValue" editable />
      </PlaygroundCard>
      <PlaygroundCard
        title="Format Compatibility, Editable"
        description="v-model is seeded with '2026-08-27 23:15:00 (EDT)', editable, and also accepts these on paste — try '8/27/26 23:15' or '2026-08-28 00:00:00 (EDT)'."
        :value="gaValue"
      >
        <DateTimePicker v-model="gaValue" editable />
      </PlaygroundCard>
      <PlaygroundCard
        title="⛓ Chained Start Date"
        description="Start date cannot be after end date. Will focus end date if you use the accept checkmark."
        :value="{ start: startValue}"
      >
        <div class="chained-pickers">
          <DateTimePicker
            v-model="startValue"
            only-date
            :max-date="endValue"
            placeholder="Start date"
            @confirm="onStartConfirm"
          />
        </div>
      </PlaygroundCard>
      <PlaygroundCard
        title="⛓ Chain End Date"
        description="End date cannot be before start date"
        :value="{ end: endValue }"
      >
        <div class="chained-pickers">
          <DateTimePicker
            ref="endPickerRef"
            v-model="endValue"
            only-date
            :min-date="startValue"
            placeholder="End date"
          />
        </div>
      </PlaygroundCard>
      <PlaygroundCard
        title="⛓ Chained Start Time"
        description="Start time cannot be after end time. Will focus end time if you use the accept checkmark."
        :value="{ start: startTimeValue }"
      >
        <div class="chained-pickers">
          <DateTimePicker
            v-model="startTimeValue"
            only-time
            :max-time="endTimeValue"
            placeholder="Start time"
            @confirm="onStartTimeConfirm"
          />
        </div>
      </PlaygroundCard>
      <PlaygroundCard
        title="⛓ Chain End Time"
        description="End time cannot be before start time"
        :value="{ end: endTimeValue }"
      >
        <div class="chained-pickers">
          <DateTimePicker
            ref="endTimePickerRef"
            v-model="endTimeValue"
            only-time
            :min-time="startTimeValue"
            placeholder="End time"
          />
        </div>
      </PlaygroundCard>

    </div>
  </main>
</template>

<style scoped>
.playground {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.playground-header h1 {
  margin: 0 0 0.5rem;
}

.playground-header p {
  margin: 0 0 2rem;
  color: #787878;
}

/* CSS multi-column masonry (column-width + break-inside: avoid) was tried
   here to close the gaps a tall card leaves in a plain grid, but it has a
   nasty side effect: growing ANY earlier card's height rebalances the whole
   column flow, which can jump a LATER card (and anything anchored to it,
   like an open VueDatePicker popover) to a completely different column.
   Confirmed live: growing one card's value preview moved another card's
   input from (173, 889) to (549, 90). That's what was causing the
   date-range picker to visibly flicker closed/reopen while using presets —
   vue-datepicker's floating-ui positioning was chasing its anchor around
   the page. A plain grid only reflows rows below a growing card, not the
   entire layout, so it doesn't fight with anything that's anchored to a
   card mid-interaction.
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
.playground-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
  align-items: start;
}

.chained-pickers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
