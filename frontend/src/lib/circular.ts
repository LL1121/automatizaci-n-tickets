/** Catálogo Circular 08/2026 — tipo de actividad oficial. */
export const ACTIVIDAD_OPCIONES = [
  "Traslado oficial",
  "Mantenimiento de red",
  "Emergencia hídrica",
  "Obra",
  "Control / inspección",
  "Otro",
] as const;

export type TipoActividad = (typeof ACTIVIDAD_OPCIONES)[number];

export type ConductorForm = {
  legajo: string;
  nombre: string;
  actividad: TipoActividad | "";
};

export const VEHICLE_TIPO_OPTIONS = [
  { value: "liviano", label: "Liviano" },
  { value: "camioneta", label: "Camioneta" },
  { value: "camion", label: "Camión" },
  { value: "maquinaria", label: "Maquinaria" },
] as const;

export const UNIDAD_CONSUMO_OPTIONS = [
  { value: "l_100km", label: "L / 100 km" },
  { value: "l_hora", label: "L / hora motor" },
] as const;
