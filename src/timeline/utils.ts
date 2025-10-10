import {getCalendarDateString} from '../services';
import {Event} from './EventBlock';

interface EventSegment extends Event {
  segmentDate: string;
  isEventSegment: boolean;
  originalEvent?: Event;
  dayType?: 'start' | 'middle' | 'end';
}

// helper function to create event segments for multi-day events with proper time boundaries
// start day: from start time to end of day
// middle days: full day (00:00 to 23:59)
// end day: from start of day to end time
export const createEventSegments = (events: Event[], pageDates: string[]): EventSegment[] => {
  const segments: EventSegment[] = [];

  events.forEach(event => {
    if (!event.start || !event.end) {
      return;
    }

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    // get date strings for start and end dates
    const startDateString = getCalendarDateString(startDate);
    const endDateString = getCalendarDateString(endDate);

    // if it's a single day event, just add it as is
    if (startDateString === endDateString) {
      if (pageDates.includes(startDateString)) {
        segments.push({
          ...event,
          segmentDate: startDateString,
          // mark as original event
          isEventSegment: false
        });
      }
      return;
    }

    // multi-day event: create segments for each day it spans
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0); // start at beginning of day

    const endDateOnly = new Date(endDate);
    endDateOnly.setHours(0, 0, 0, 0); // End date without time

    let dayCount = 0;
    while (currentDate <= endDateOnly) {
      const dateString = getCalendarDateString(currentDate);

      // only create segment if this date is in our page dates
      if (pageDates.includes(dateString)) {
        let segmentStart, segmentEnd;

        if (dayCount === 0) {
          // first day: from original start time to end of day (23:59:59)
          segmentStart = new Date(event.start);
          segmentEnd = new Date(currentDate);
          segmentEnd.setHours(23, 59, 59, 999);
        } else if (getCalendarDateString(currentDate) === endDateString) {
          // last day: from start of day (00:00) to original end time
          segmentStart = new Date(currentDate);
          segmentStart.setHours(0, 0, 0, 0);
          segmentEnd = new Date(event.end);
        } else {
          // middle days: full day (00:00 to 23:59:59)
          segmentStart = new Date(currentDate);
          segmentStart.setHours(0, 0, 0, 0);
          segmentEnd = new Date(currentDate);
          segmentEnd.setHours(23, 59, 59, 999);
        }

        // Create event segment for this day
        segments.push({
          ...event,
          start: segmentStart,
          end: segmentEnd,
          // keep reference to original event
          originalEvent: event,
          // track which day this segment belongs to
          segmentDate: dateString,
          // flag to identify segments
          isEventSegment: true,
          dayType: dayCount === 0 ? 'start' : getCalendarDateString(currentDate) === endDateString ? 'end' : 'middle'
        });
      }

      // move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      dayCount++;
    }
  });

  return segments;
};
