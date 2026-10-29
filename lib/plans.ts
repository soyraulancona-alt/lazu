// Qué incluye cada plan. Los datos siempre se recolectan; lo que se cobra es
// verlos y usarlos. Si la vigencia (paidUntil) vence, la empresa baja a lo básico
// hasta renovar, sin perder historial.
export type PlanId = "INDIVIDUAL" | "TEAM" | "ENTERPRISE";

export type PlanFeatures = {
  /** Ranking por colaborador y estadísticas del equipo completo. */
  teamStats: boolean;
  /** Formulario de contacto en el perfil y bandeja de contactos. */
  leads: boolean;
  /** Descarga CSV de contactos. */
  leadsExport: boolean;
  /** Tarjetas físicas reasignables con enlace corto. */
  cards: boolean;
  /** Registro de acciones administrativas visible para el cliente. */
  auditLog: boolean;
};

export const PLAN_LABELS: Record<PlanId, string> = {
  INDIVIDUAL: "Individual",
  TEAM: "Equipo",
  ENTERPRISE: "Empresa",
};

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
  INDIVIDUAL: { teamStats: false, leads: true, leadsExport: false, cards: true, auditLog: false },
  TEAM: { teamStats: true, leads: true, leadsExport: true, cards: true, auditLog: false },
  ENTERPRISE: { teamStats: true, leads: true, leadsExport: true, cards: true, auditLog: true },
};

// Lo que queda con la vigencia vencida: estadísticas propias y nada más.
const LAPSED: PlanFeatures = {
  teamStats: false,
  leads: false,
  leadsExport: false,
  cards: false,
  auditLog: false,
};

export type PlanAccess = {
  plan: PlanId;
  /** false si paidUntil ya pasó. Sin paidUntil (piloto o cortesía) se considera vigente. */
  current: boolean;
  features: PlanFeatures;
};

export function planAccess(
  org: { plan: PlanId; paidUntil: Date | null },
  now: Date = new Date(),
): PlanAccess {
  const current = !org.paidUntil || org.paidUntil.getTime() >= now.getTime();
  return { plan: org.plan, current, features: current ? PLAN_FEATURES[org.plan] : LAPSED };
}

/** Cuántos perfiles activos más caben en el plan. */
export function seatsAvailable(seatLimit: number, activeProfiles: number): number {
  return Math.max(0, seatLimit - activeProfiles);
}
