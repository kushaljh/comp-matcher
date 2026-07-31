import { AdminGate } from '../../../features/admin/AdminGate';
import { FeedbackPanel } from '../../../features/admin/FeedbackPanel';

export default function AdminFeedbackScreen() {
  return (
    <AdminGate title="Feedback" back>
      <FeedbackPanel />
    </AdminGate>
  );
}
