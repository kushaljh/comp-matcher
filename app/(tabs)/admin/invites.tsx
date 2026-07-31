import { AdminGate } from '../../../features/admin/AdminGate';
import { InvitesPanel } from '../../../features/admin/InvitesPanel';

export default function AdminInvitesScreen() {
  return (
    <AdminGate title="Invites" back>
      <InvitesPanel />
    </AdminGate>
  );
}
