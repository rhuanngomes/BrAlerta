export type IncidentCategory = 'STREETLIGHT' | 'POTHOLE' | 'FLOOD' | 'SAFETY' | 'TRAFFIC';
export type IncidentStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
export type IncidentEventType = 'CREATED' | 'STATUS_UPDATED' | 'DETAILS_UPDATED' | 'CANCELLED';
export const incidentCategoryLabels: Record<IncidentCategory, string> = {
  STREETLIGHT: 'Poste apagado',
  POTHOLE: 'Buraco na rua',
  FLOOD: 'Rua alagada',
  SAFETY: 'Ocorrência de segurança',
  TRAFFIC: 'Trânsito intenso',
};
export interface IncidentHistory { id: string; incidentId: string; previousStatus?: IncidentStatus; newStatus: IncidentStatus; changedBy: string; changedAt: string; eventType?: IncidentEventType; }
export interface Incident { id: string; userId: string; category: IncidentCategory; title: string; description: string; latitude: number; longitude: number; address?: string; status: IncidentStatus; photoUrl?: string; createdAt: string; updatedAt: string; history: IncidentHistory[]; }
export interface IncidentInput { category: IncidentCategory; title: string; description: string; latitude: number; longitude: number; address?: string; photoUrl?: string; photoFile?: File; }
export interface IncidentUpdateInput { category: IncidentCategory; title: string; description: string; }
