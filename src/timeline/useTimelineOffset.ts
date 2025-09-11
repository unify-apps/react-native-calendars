import {useCallback, useEffect, MutableRefObject} from 'react';
import {ScrollView} from 'react-native';

interface UseTimelineOffsetProps {
  onChangeOffset?: (offset: number) => void;
  scrollOffset?: number;
  scrollViewRef: MutableRefObject<ScrollView | undefined>;
  isCurrentDay?: boolean;
}

export default (props: UseTimelineOffsetProps) => {
  const {onChangeOffset, scrollOffset, scrollViewRef, isCurrentDay} = props;
  useEffect(() => {
    // NOTE: The main reason for this feature is to sync the offset
    // between all of the timelines in the TimelineList component
    // don't scroll if the current day is in focus
    if (scrollOffset !== undefined && !isCurrentDay) {
      scrollViewRef?.current?.scrollTo({
        y: scrollOffset,
        animated: false
      });
    }
  }, [scrollOffset]);
  const onScrollEndDrag = useCallback(event => {
    const offset = event.nativeEvent.contentOffset.y;
    const velocity = event.nativeEvent.velocity?.y;
    if (velocity === 0) {
      onChangeOffset?.(offset);
    }
  }, []);
  const onMomentumScrollEnd = useCallback(event => {
    onChangeOffset?.(event.nativeEvent.contentOffset.y);
  }, []);
  return {
    scrollEvents: {
      onScrollEndDrag,
      onMomentumScrollEnd
    }
  };
};
