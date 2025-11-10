import inRange from 'lodash/inRange';
import XDate from 'xdate';
import constants from '../commons/constants';
import {Event} from './EventBlock';
// import {PackedEvent} from './EventBlock';

type PartialPackedEvent = Event & {index: number};
interface PopulateOptions {
  screenWidth?: number;
  dayStart?: number;
  hourBlockHeight?: number;
  overlapEventsSpacing?: number;
  rightEdgeSpacing?: number;
}

export interface UnavailableHours {
  start: number;
  end: number;
}

interface UnavailableHoursOptions {
  hourBlockHeight?: number;
  dayStart: number;
  dayEnd: number;
}

export const HOUR_BLOCK_HEIGHT = 100;
// const OVERLAP_EVENTS_SPACINGS = 10;
const RIGHT_EDGE_SPACING = 10;

// helper function to check if one event is contained within another
// returns true if eventA is completely contained within eventB's time span
function isEventContained(eventA: Event, eventB: Event) {
  return eventA.start >= eventB.start && eventA.end <= eventB.end;
}

// helper function to calculate event duration in milliseconds
// used for determining which events are shorter/longer
function getEventDuration(event: Event) {
  return new Date(event.end).getTime() - new Date(event.start).getTime();
}

// build event with proper positioning and z-index for layering
// shorter events get higher z-index to appear on top of longer ones
function buildEvent(
  event: Event & {index: number},
  left: number,
  width: number,
  {dayStart = 0, hourBlockHeight = HOUR_BLOCK_HEIGHT},
  zIndex = 0
) {
  const startTime = new XDate(event.start);
  const endTime = event.end ? new XDate(event.end) : new XDate(startTime).addHours(1);
  const dayStartTime = new XDate(startTime).clearTime();

  // calculate event positioning based on the segment's actual start/end times
  // for event segments, the start/end times are already adjusted for the specific day
  // const eventTop = (dayStartTime.diffHours(startTime) - dayStart) * hourBlockHeight;
  // const eventHeight = startTime.diffHours(endTime) * hourBlockHeight;
  return {
    ...event,
    top: (dayStartTime.diffHours(startTime) - dayStart) * hourBlockHeight,
    height: startTime.diffHours(endTime) * hourBlockHeight,
    width,
    left,
    // add z-index for layering shorter events on top
    zIndex: zIndex
  };
}

// check if two events have time collision
// this considers the actual time ranges for proper overlap detection
function hasCollision(a: Event, b: Event) {
  return a.end > b.start && a.start < b.end;
}

// calculate how many columns an event can span without collision
// this ensures proper width calculation for overlapping events
function calcColumnSpan(event: Event, columnIndex: number, columns: Event[][]) {
  let colSpan = 1;
  for (let i = columnIndex + 1; i < columns.length; i++) {
    const column = columns[i];
    const foundCollision = column.find(ev => hasCollision(event, ev));
    if (foundCollision) {
      return colSpan;
    }
    colSpan++;
  }
  return colSpan;
}

// pack overlapping events into columns and calculate their positioning with z-index layering
// shorter events contained within longer ones get higher z-index to appear on top
function packOverlappingEventGroup(
  columns: PartialPackedEvent[][],
  calculatedEvents: PartialPackedEvent[],
  populateOptions: PopulateOptions
) {
  const {
    screenWidth = constants.screenWidth,
    rightEdgeSpacing = RIGHT_EDGE_SPACING
    // overlapEventsSpacing = OVERLAP_EVENTS_SPACINGS
  } = populateOptions;

  // first pass: create all events with their basic positioning
  const eventsInGroup: PartialPackedEvent[] = [];
  columns.forEach((column, columnIndex) => {
    column.forEach(event => {
      const totalWidth = screenWidth - rightEdgeSpacing;
      const columnSpan = calcColumnSpan(event, columnIndex, columns);
      const eventLeft = (columnIndex / columns.length) * totalWidth;
      let eventWidth = totalWidth * (columnSpan / columns.length);

      // tocheck: if this is even required.
      // if (columnIndex + columnSpan <= columns.length - 1) {
      //   eventWidth -= overlapEventsSpacing;
      // }

      eventsInGroup.push({
        // @ts-expect-error -- fix the type
        event,
        left: eventLeft,
        width: eventWidth,
        duration: getEventDuration(event),
        columnIndex
      });
    });
  });

  // second pass: calculate z-index based on containment and duration
  // shorter events contained within longer ones get higher z-index
  eventsInGroup.forEach((eventInfo, index) => {
    let zIndex = 0;

    // check if this event is contained within any other events in the group
    eventsInGroup.forEach((otherEventInfo, otherIndex) => {
      // @ts-expect-error -- fix the type
      if (index !== otherIndex && isEventContained(eventInfo.event, otherEventInfo.event)) {
        // if this event is contained within another and is shorter, increase z-index
        // @ts-expect-error -- fix the type
        if (eventInfo.duration <= otherEventInfo.duration) {
          zIndex += 10; // increment z-index to ensure it appears on top
        }
      }
    });

    // additional z-index boost for very short events (less than 1 hour)
    // @ts-expect-error -- fix the type
    if (eventInfo.duration < 60 * 60 * 1000) {
      // less than 1 hour
      zIndex += 5;
    }

    // @ts-expect-error -- fix the type
    calculatedEvents.push(buildEvent(eventInfo.event, eventInfo.left, eventInfo.width, populateOptions, zIndex));
  });
}

// main function to populate and position events for a day with proper layering
// this processes all events/segments and ensures shorter contained events appear on top
export function populateEvents(_events, populateOptions) {
  let lastEnd = null;
  let columns = [];
  const calculatedEvents = [];

  // sort events by start time, then by duration (shorter first) for consistent positioning
  // this helps ensure shorter events are processed in a way that promotes proper layering
  const events = _events
    .map((ev: Event, index: number) => ({...ev, index: index}))
    .sort(function (a: Event, b: Event) {
      // primary sort: by start time
      if (a.start < b.start) return -1;
      if (a.start > b.start) return 1;

      // secondary sort: by duration (shorter events first)
      const aDuration = getEventDuration(a);
      const bDuration = getEventDuration(b);
      if (aDuration < bDuration) return -1;
      if (aDuration > bDuration) return 1;

      // tertiary sort: by end time
      if (a.end < b.end) return -1;
      if (a.end > b.end) return 1;
      return 0;
    });

  // process each event/segment and group overlapping ones into columns
  // this creates the layout structure for rendering with proper layering
  events.forEach(function (ev) {
    // reset recent overlapping event group and start a new one
    if (lastEnd !== null && ev.start >= lastEnd) {
      packOverlappingEventGroup(columns, calculatedEvents, populateOptions);
      columns = [];
      lastEnd = null;
    }
    // place current event in the right column where it doesn't overlap
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      // @ts-expect-error -- fix the type
      if (!hasCollision(col[col.length - 1], ev)) {
        // @ts-expect-error -- fix the type
        col.push(ev);
        placed = true;
        break;
      }
    }
    // if current event wasn't placed in any of the columns, create a new column for it
    if (!placed) {
      // @ts-expect-error -- fix the type
      columns.push([ev]);
    }
    if (lastEnd === null || ev.end > lastEnd) {
      lastEnd = ev.end;
    }
  });

  // process the final group of overlapping events with proper layering
  // this ensures all events/segments are properly positioned with correct z-index
  if (columns.length > 0) {
    packOverlappingEventGroup(columns, calculatedEvents, populateOptions);
  }
  return calculatedEvents;
}

// build unavailable hours blocks for visual representation
// this creates the grayed-out areas for unavailable time slots
export function buildUnavailableHoursBlocks(
  unavailableHours: UnavailableHours[] = [],
  options: UnavailableHoursOptions
) {
  const {hourBlockHeight = HOUR_BLOCK_HEIGHT, dayStart = 0, dayEnd = 24} = options || {};
  const totalDayHours = dayEnd - dayStart;
  const totalDayHeight = (dayEnd - dayStart) * hourBlockHeight;
  return (
    unavailableHours
      .map(hours => {
        if (!inRange(hours.start, 0, 25) || !inRange(hours.end, 0, 25)) {
          console.error('Calendar Timeline unavailableHours is invalid. Hours should be between 0 and 24');
          return undefined;
        }
        if (hours.start >= hours.end) {
          console.error('Calendar Timeline availableHours is invalid. start hour should be earlier than end hour');
          return undefined;
        }
        const startFixed = Math.max(hours.start, dayStart);
        const endFixed = Math.min(hours.end, dayEnd);
        return {
          top: ((startFixed - dayStart) / totalDayHours) * totalDayHeight,
          height: (endFixed - startFixed) * hourBlockHeight
        };
      })
      // note: this filter removes falsy values (undefined blocks)
      .filter(Boolean)
  );
}
