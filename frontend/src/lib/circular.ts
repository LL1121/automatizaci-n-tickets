export type ConductorForm = {
  legajo: string;
  nombre: string;
  actividad: string;
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
