import { useSpring } from '@react-spring/web';
import {
  PR_ENTRANCE_FROM_NEW,
  PR_ENTRANCE_FROM_SKIP,
  PR_ENTRANCE_SPRING_CONFIG,
  PR_ENTRANCE_TO,
} from './constants';

export const usePrEntranceSpring = (isNew: boolean) =>
  useSpring({
    from: isNew ? PR_ENTRANCE_FROM_NEW : PR_ENTRANCE_FROM_SKIP,
    to: PR_ENTRANCE_TO,
    config: PR_ENTRANCE_SPRING_CONFIG,
  });
