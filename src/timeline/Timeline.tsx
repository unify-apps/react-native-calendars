import min from 'lodash/min';
import map from 'lodash/map';
import times from 'lodash/times';
import groupBy from 'lodash/groupBy';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, ScrollView } from 'react-native';
import constants from '../commons/constants';
import { generateDay } from '../dateutils';
import { Theme } from '../types';
import styleConstructor from './style';
import { populateEvents, HOUR_BLOCK_HEIGHT, UnavailableHours } from './Packer';
import { calcTimeOffset } from './helpers/presenter';
import TimelineHours, { TimelineHoursProps } from './TimelineHours';
import EventBlock, { Event, PackedEvent } from './EventBlock';
import NowIndicator from './NowIndicator';
import useTimelineOffset from './useTimelineOffset';
import isNil from 'lodash/isNil';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createEventSegments } from './utils';
import { JSX } from 'react';

export interface TimelineProps {
  /**
   * The date / dates of this timeline instance in ISO format (e.g. 2011-10-25)
   */
  date?: string | string[];
  /**
   * List of events to display in this timeline
   */
  events: Event[];
  /**
   * The timeline day start time
   */
  start?: number;
  /**
   * The timeline day end time
   */
  end?: number;
  /**
   * @deprecated
   * Use onEventPress instead
   */
  eventTapped?: (event: Event) => void;
  /**
   * Handle event press
   */
  onEventPress?: (event: Event) => void;
  /**
   * Pass to handle creation of a new event by long press on the timeline background
   * NOTE: If passed, the date prop will be included in the returned time string (e.g. 2017-09-06 01:30:00)
   */
  onBackgroundLongPress?: TimelineHoursProps['onBackgroundLongPress'];
  /**
   * Pass to handle creation of a new event by long press out on the timeline background
   * NOTE: If passed, the date prop will be included in the returned time string (e.g. 2017-09-06 01:30:00)
   */
  onBackgroundLongPressOut?: TimelineHoursProps['onBackgroundLongPressOut'];
  styles?: Theme;
  /** Specify theme properties to override specific styles for calendar parts */
  theme?: Theme;
  /**
   * Should scroll to first event when loaded
   */
  scrollToFirst?: boolean;
  /**
   * Should scroll to current time when loaded
   */
  scrollToNow?: boolean;
  /**
   * Initial time to scroll to
   */
  initialTime?: {
    hour: number;
    minutes: number;
  };
  /**
   * Whether to use 24 hours format for the timeline hours
   */
  format24h?: boolean;
  /**
   * Render a custom event block
   */
  renderEvent?: (event: PackedEvent) => JSX.Element;

  renderAllDayEvent?: (props: {
    position: {
      top: number;
      left: number;
      height: number;
      width: number;
    };
    eventSegment: PackedEvent;
    eventClick?: (event: PackedEvent) => void;
  }) => JSX.Element;
  /**
   * Whether to show now indicator
   */
  showNowIndicator?: boolean;
  /**
   * A scroll offset value that the timeline will sync with
   */
  scrollOffset?: number;
  /**
   * Listen to onScroll event of the timeline component
   */
  onChangeOffset?: (offset: number) => void;
  /**
   * Spacing between overlapping events
   */
  overlapEventsSpacing?: number;
  /**
   * Spacing to keep at the right edge (for background press)
   */
  rightEdgeSpacing?: number;
  /**
   * Range of available hours
   */
  unavailableHours?: UnavailableHours[];
  /**
   * Background color for unavailable hours
   */
  unavailableHoursColor?: string;
  /**
   * The number of days to present in the timeline calendar
   */
  numberOfDays?: number;
  /**
   * The left inset of the timeline calendar (sidebar width), default is 72
   */
  timelineLeftInset?: number;
  /** Identifier for testing */
  testID?: string;
  /**
   * Whether the current day is in focus
   */
  isCurrentDay?: boolean;
}

const VERTICAL_PADDING = 4;
const ROW_HEIGHT = 24;
const EVENT_GAP = 4;
const H_PAD = 6;

const AllDayEvents = ({
  numberOfDays,
  width,
  timelineLeftInset,
  eventsByDay,
  onEventPress,
  styles,
  renderAllDayEvent
}) => {
  const colWidth = width / numberOfDays;
  const dayEventCounts = eventsByDay.map(d => d.filter(e => e.allDay));
  const maxDayEvents = Math.max(1, ...dayEventCounts.map(d => d.length));
  const extraEvents = maxDayEvents > 3 ? maxDayEvents - 3 : 0;
  const maxStack = Math.min(maxDayEvents, 3) - Number(extraEvents > 0);
  const containerHeight =
    (maxStack + (extraEvents > 0 ? 1 : 0)) * ROW_HEIGHT + VERTICAL_PADDING * 2 + EVENT_GAP * (maxStack - 1);

  return (
    <View
      style={[s.container, { borderColor: styles.line?.backgroundColor }, styles.container, { height: containerHeight }]}
    >
      <View style={[s.labelBox, { width: timelineLeftInset - 16 }]}>
        <Text style={styles.allDayLabelText}>All-day</Text>
      </View>

      <View style={[s.daysArea, { width: constants.screenWidth - (timelineLeftInset - 16) }]}>
        {times(numberOfDays, index => (
          <View
            key={`sep-${index}`}
            style={[
              styles.verticalLine,
              { right: (index + 1) * colWidth } // same math as TimelineHours
            ]}
          />
        ))}

        {eventsByDay.map((dayEvents, dayIndex) => {
          const allDayEvents = dayEvents.filter(e => e.allDay);
          const visibleEvents = allDayEvents.slice(0, maxStack);
          const hiddenEventsCount = Math.max(0, allDayEvents.length - maxStack);

          return (
            <React.Fragment key={dayIndex}>
              {visibleEvents.map((evt, stackIndex) => {
                const left = dayIndex * colWidth + H_PAD + 14;
                const top = VERTICAL_PADDING + stackIndex * ROW_HEIGHT + stackIndex * EVENT_GAP;
                const widthPx = colWidth - H_PAD * 2;
                const handlePress = () => onEventPress?.(evt.originalEvent || evt);

                if (renderAllDayEvent) {
                  return renderAllDayEvent({
                    position: {
                      top,
                      left,
                      width: widthPx,
                      height: ROW_HEIGHT
                    },
                    eventSegment: evt,
                    eventClick: onEventPress
                  });
                }

                return (
                  <TouchableOpacity
                    key={`${dayIndex}-${stackIndex}-${evt.id ?? stackIndex}`}
                    activeOpacity={0.8}
                    onPress={handlePress}
                    style={[
                      s.chip,
                      {
                        left,
                        top,
                        width: widthPx,
                        height: ROW_HEIGHT
                      }
                    ]}
                  >
                    <View style={s.chipDot} />
                    <Text numberOfLines={1} style={s.chipText}>
                      {evt.title || evt.name || 'All-day'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {hiddenEventsCount > 0 && (
                <View
                  key={`extra-${dayIndex}`}
                  style={{
                    position: 'absolute',
                    left: dayIndex * colWidth + H_PAD + 14,
                    top: VERTICAL_PADDING + maxStack * ROW_HEIGHT + maxStack * EVENT_GAP,
                    width: colWidth - H_PAD * 2,
                    height: ROW_HEIGHT,
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingHorizontal: 6,
                    paddingBottom: 6
                  }}
                >
                  <Text
                    style={{
                      color: '#667085',
                      fontSize: 12,
                      fontWeight: '500'
                    }}
                  >
                    +{hiddenEventsCount}
                  </Text>
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    width: '100%',
    borderBottomWidth: 1,
    borderColor: '#D8D8D8',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF'
  },
  labelBox: {
    justifyContent: 'center',
    paddingLeft: 8
  },
  labelText: {
    fontSize: 12,
    color: '#6B7280'
  },
  daysArea: {
    flex: 1
  },
  chip: {
    position: 'absolute',
    backgroundColor: '#635BFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginRight: 6
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600'
  }
});

// helper to detect all-day
const isAllDayEvent = (e: Event | PackedEvent) => {
  return e.allDay || (e as { originalEvent?: Event }).originalEvent?.allDay;
};

const Timeline = (props: TimelineProps) => {
  const {
    format24h = true,
    start = 0,
    end = 24,
    date = '',
    events,
    onEventPress,
    onBackgroundLongPress,
    onBackgroundLongPressOut,
    renderEvent,
    theme,
    scrollToFirst,
    scrollToNow,
    initialTime,
    showNowIndicator,
    scrollOffset,
    onChangeOffset,
    overlapEventsSpacing = 0,
    rightEdgeSpacing = 0,
    unavailableHours,
    unavailableHoursColor,
    eventTapped,
    numberOfDays = 1,
    timelineLeftInset = 0,
    testID,
    isCurrentDay,
    renderAllDayEvent
  } = props;

  const pageDates = useMemo(() => {
    return typeof date === 'string' ? [date] : date;
  }, [date]);

  // this ensures multi-day events appear correctly on each day they span
  const eventSegments = useMemo(() => {
    if (!events || events.length === 0) return [];
    return createEventSegments(events, pageDates);
  }, [events, pageDates]);

  // group event segments by date
  // each day gets its appropriate event segments with correct time boundaries
  const groupedEvents = useMemo(() => {
    return groupBy(eventSegments, e => e.segmentDate);
  }, [eventSegments]);

  // map each page date to its corresponding event segments
  // this creates the events array for each day in the timeline
  const pageEvents = useMemo(() => {
    return map(pageDates, d => groupedEvents[d] || []);
  }, [pageDates, groupedEvents]);

  const scrollView = useRef<ScrollView | undefined>(undefined);
  const calendarHeight = useMemo(() => (end - start) * HOUR_BLOCK_HEIGHT, [end, start]);
  const styles = useMemo(
    () => styleConstructor(theme || props.styles, calendarHeight),
    [theme, props.styles, calendarHeight]
  );

  const { scrollEvents } = useTimelineOffset({ onChangeOffset, scrollOffset, scrollViewRef: scrollView, isCurrentDay });
  const width = useMemo(() => {
    return constants.screenWidth - timelineLeftInset;
  }, [timelineLeftInset]);

  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay = pageEvents.map(list => list.filter(isAllDayEvent));
    const timed = pageEvents.map(list => list.filter(e => !isAllDayEvent(e)));
    return { allDayByDay: allDay, timedByDay: timed };
  }, [pageEvents]);

  // process events for positioning and overlap handling
  // each day's event segments are processed separately for proper positioning
  const packedEvents = useMemo(() => {
    return map(timedByDay, (_e, i) => {
      return populateEvents(timedByDay[i], {
        screenWidth: width / numberOfDays,
        dayStart: start,
        overlapEventsSpacing: overlapEventsSpacing / numberOfDays,
        rightEdgeSpacing: rightEdgeSpacing / numberOfDays
      });
    });
  }, [start, numberOfDays, overlapEventsSpacing, rightEdgeSpacing, width, timedByDay]);

  useEffect(() => {
    // if we have scrollOffset, we won't use scrollTo to set the initial offset
    // as we want to keep offset same as the point where user left off in other day.
    if (isNil(scrollOffset)) {
      return;
    }
    // this part of code will never execute but we keep it here for future reference.
    let initialPosition = 0;
    if (scrollToNow) {
      initialPosition = calcTimeOffset(HOUR_BLOCK_HEIGHT);
    } else if (scrollToFirst && packedEvents[0].length > 0) {
      initialPosition = min(map(packedEvents[0], 'top')) ?? 0;
    } else if (initialTime) {
      initialPosition = calcTimeOffset(HOUR_BLOCK_HEIGHT, initialTime.hour, initialTime.minutes);
    }
    if (initialPosition) {
      setTimeout(() => {
        scrollView?.current?.scrollTo({
          y: Math.max(0, initialPosition - HOUR_BLOCK_HEIGHT),
          animated: true
        });
      }, 0);
    }
  }, []);

  const _onEventPress = useCallback(
    (event: Event | PackedEvent) => {
      // if event is a segment, use the original event
      const eventToPass = (event as { originalEvent?: Event }).originalEvent || event;
      if (eventTapped) {
        //TODO: remove after deprecation
        eventTapped(eventToPass);
      } else {
        onEventPress?.(eventToPass);
      }
    },
    [onEventPress, eventTapped]
  );

  // render events for a specific day
  const renderEvents = (dayIndex: number) => {
    const events = packedEvents[dayIndex].map((event: PackedEvent, eventIndex: number) => {
      const onEventPress = () => _onEventPress(event);
      return (
        <EventBlock
          key={eventIndex}
          index={eventIndex}
          event={event}
          styles={styles}
          format24h={format24h}
          onPress={onEventPress}
          renderEvent={renderEvent}
          testID={`${testID}.event.${event.id}`}
        />
      );
    });
    return (
      <View
        pointerEvents={'box-none'}
        style={[{ marginLeft: dayIndex === 0 ? timelineLeftInset : undefined }, styles.eventsContainer]}
      >
        {events}
      </View>
    );
  };
  const renderTimelineDay = (dayIndex: number) => {
    const indexOfToday = pageDates.indexOf(generateDay(new Date().toString()));
    const left = timelineLeftInset + (indexOfToday * width) / numberOfDays;
    return (
      <React.Fragment key={dayIndex}>
        {renderEvents(dayIndex)}
        {indexOfToday !== -1 && showNowIndicator && (
          <NowIndicator width={width / numberOfDays} left={left} styles={styles} />
        )}
      </React.Fragment>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <AllDayEvents
        numberOfDays={numberOfDays}
        width={width}
        timelineLeftInset={timelineLeftInset}
        eventsByDay={allDayByDay}
        onEventPress={_onEventPress}
        styles={styles}
        renderAllDayEvent={renderAllDayEvent}
      />

      <ScrollView
        // @ts-expect-error -- type is correct.
        ref={scrollView}
        style={styles.container}
        contentContainerStyle={[styles.contentStyle, { width: constants.screenWidth }]}
        showsVerticalScrollIndicator={false}
        {...scrollEvents}
        testID={testID}
      >
        <TimelineHours
          start={start}
          end={end}
          date={pageDates[0]}
          format24h={format24h}
          styles={styles}
          unavailableHours={unavailableHours}
          unavailableHoursColor={unavailableHoursColor}
          onBackgroundLongPress={onBackgroundLongPress}
          onBackgroundLongPressOut={onBackgroundLongPressOut}
          width={width}
          numberOfDays={numberOfDays}
          timelineLeftInset={timelineLeftInset}
          testID={`${testID}.hours`}
        />
        {times(numberOfDays, renderTimelineDay)}
      </ScrollView>
    </View>
  );
};
export default React.memo(Timeline);

export type { Event as TimelineEventProps, PackedEvent as TimelinePackedEventProps };
