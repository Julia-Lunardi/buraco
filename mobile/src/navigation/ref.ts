import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/** For navigating from outside screens (e.g. a notification tap). */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
