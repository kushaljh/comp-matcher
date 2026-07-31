// TanStack Query hooks for sending feedback.
import { useMutation } from '@tanstack/react-query';
import * as api from './api';

// No invalidation: a sent note isn't shown anywhere on the sender's side, so
// there is no cache for it to go stale in. The admin panel's ['admin',
// 'feedback'] key is refetched on its own schedule.
export function useSubmitFeedback() {
  return useMutation({ mutationFn: api.submitFeedback });
}
