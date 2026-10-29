import { inputClass, labelClass } from "./action-form";

export type EditableProfile = {
  id: string;
  name: string;
  status: string;
  jobTitle: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  publicUrl: string | null;
  memberUserId: string | null;
};

/** Campos compartidos por el alta (Equipo) y la edición de un perfil. */
export function ProfileFields({
  members,
  profile,
}: {
  members: { id: string; name: string }[];
  profile?: Partial<EditableProfile>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className={labelClass}>
        Nombre en el perfil
        <input name="name" required defaultValue={profile?.name} placeholder="Ana Torres" className={inputClass} />
      </label>
      <label className={labelClass}>
        Puesto
        <input name="jobTitle" defaultValue={profile?.jobTitle ?? ""} placeholder="Asesora comercial" className={inputClass} />
      </label>
      <label className={labelClass}>
        Colaborador
        <select name="memberUserId" defaultValue={profile?.memberUserId ?? ""} className={inputClass}>
          <option value="">Sin asignar</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        WhatsApp
        <input name="whatsapp" defaultValue={profile?.whatsapp ?? ""} placeholder="5215512345678" className={inputClass} />
      </label>
      <label className={labelClass}>
        Teléfono
        <input name="phone" defaultValue={profile?.phone ?? ""} placeholder="+52 55 1234 5678" className={inputClass} />
      </label>
      <label className={labelClass}>
        Correo
        <input name="email" type="email" defaultValue={profile?.email ?? ""} placeholder="ana@empresa.com" className={inputClass} />
      </label>
      <label className={`${labelClass} md:col-span-3`}>
        URL publicada del perfil <span className="font-normal text-slate-400">(a dónde llevan las tarjetas)</span>
        <input name="publicUrl" type="url" defaultValue={profile?.publicUrl ?? ""} placeholder="https://empresa.lazu.bio/ana.html" className={inputClass} />
      </label>
    </div>
  );
}
