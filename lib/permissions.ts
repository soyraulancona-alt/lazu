// Matriz de permisos dentro de una empresa. Es la única fuente de verdad:
// las páginas la usan para mostrar u ocultar acciones, y lib/guards.ts la vuelve
// a comprobar en el servidor antes de cada lectura o escritura.
export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export type OrgAction =
  | "org.view" // entrar al panel de la empresa
  | "stats.team" // ver estadísticas de todo el equipo (no solo las propias)
  | "profiles.manage" // crear, editar, asignar y pausar perfiles
  | "members.manage" // invitar, cambiar rol y quitar miembros (no propietarios)
  | "members.manageOwners" // nombrar o quitar propietarios
  | "cards.manage" // crear, asignar, reasignar y desactivar tarjetas
  | "leads.viewAll" // ver los contactos de todo el equipo
  | "leads.export" // descargar contactos en CSV
  | "audit.view" // ver el registro de acciones
  | "org.settings" // nombre de la empresa y página de respaldo de las tarjetas
  | "billing.manage"; // cambiar plan, asientos y vigencia (solo personal de LAZU)

const MATRIX: Record<OrgAction, readonly OrgRole[]> = {
  "org.view": ["OWNER", "ADMIN", "MEMBER"],
  "stats.team": ["OWNER", "ADMIN"],
  "profiles.manage": ["OWNER", "ADMIN"],
  "members.manage": ["OWNER", "ADMIN"],
  "members.manageOwners": ["OWNER"],
  "cards.manage": ["OWNER", "ADMIN"],
  "leads.viewAll": ["OWNER", "ADMIN"],
  "leads.export": ["OWNER", "ADMIN"],
  "audit.view": ["OWNER", "ADMIN"],
  "org.settings": ["OWNER"],
  // El cobro lo administra LAZU, no el cliente: ningún rol de empresa lo tiene.
  "billing.manage": [],
};

export function can(role: OrgRole, action: OrgAction, isPlatformAdmin = false): boolean {
  if (isPlatformAdmin) return true;
  return MATRIX[action].includes(role);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MEMBER: "Colaborador",
};

/** ¿Puede `actor` asignar `target` como rol, o modificar a alguien que hoy tiene `current`? */
export function canAssignRole(
  actor: OrgRole,
  target: OrgRole,
  current: OrgRole | null,
  isPlatformAdmin = false,
): boolean {
  if (isPlatformAdmin) return true;
  if (!can(actor, "members.manage")) return false;
  const touchesOwner = target === "OWNER" || current === "OWNER";
  return touchesOwner ? can(actor, "members.manageOwners") : true;
}
