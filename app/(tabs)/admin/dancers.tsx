import { AdminGate } from '../../../features/admin/AdminGate';
import { DancerRoster } from '../../../features/admin/DancerRoster';

export default function AdminDancersScreen() {
  return (
    <AdminGate title="Dancers" back>
      <DancerRoster />
    </AdminGate>
  );
}
