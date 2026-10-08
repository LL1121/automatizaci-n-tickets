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

export const MESES_PLANILLA = [
  "",
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export function nombrePlanilla(month: number): string {
  return `${MESES_PLANILLA[month] ?? "PLANILLA"}.xlsx`;
}

/** Misma regla que la columna TIPO de la planilla. */
export function etiquetaTipoVehiculo(tipo: string | null | undefined, modelo?: string | null): string {
  if (tipo === "maquinaria") {
    const nombre = (modelo ?? "").trim();
    return nombre || "Maquinaria";
  }
  const found = VEHICLE_TIPO_OPTIONS.find((option) => option.value === tipo);
  if (found) return found.label;
  return (modelo ?? "").trim();
}

export const UNIDAD_CONSUMO_OPTIONS = [
  { value: "l_100km", label: "L / 100 km" },
  { value: "l_hora", label: "L / hora motor" },
] as const;
