export interface CategoryOption {
  value: string;
  label: string;
  keywords: string[];
}

export const DIRECTORY_CATEGORIES: CategoryOption[] = [
  { value: 'all', label: 'Todas las disciplinas', keywords: [] },
  { value: 'ceramics', label: 'Cerámica', keywords: ['ceram', 'alfarer', 'taller de cerámica', 'barro'] },
  { value: 'yoga', label: 'Yoga & Pilates', keywords: ['yoga', 'pilates', 'meditac', 'cuerpo'] },
  { value: 'painting', label: 'Arte & Pintura', keywords: ['arte', 'pintura', 'dibujo', 'acuarela', 'óleo', 'grabado', 'visual'] },
  { value: 'crafts', label: 'Oficios & Talleres', keywords: ['oficio', 'manualidad', 'madera', 'carpinter', 'joyer', 'textil', 'costura', 'crafts'] },
  { value: 'dance', label: 'Danza', keywords: ['danza', 'baile', 'expresión corporal', 'movimiento', 'dance'] },
  { value: 'fitness', label: 'Fitness & Entrenamiento', keywords: ['fitness', 'entrenamiento', 'gimnas', 'marcial', 'box'] },
  { value: 'music', label: 'Música', keywords: ['música', 'canto', 'instrumento', 'guitarra', 'piano', 'music'] },
  { value: 'cooking', label: 'Gastronomía & Cocina', keywords: ['cocina', 'gastronom', 'pasteler', 'panader', 'cooking'] },
  { value: 'other', label: 'Otras actividades', keywords: ['other', 'otra', 'otros', 'general', 'taller', 'oficios'] },
];

/**
 * Traduce el valor crudo de la categoría guardado en base de datos a un nombre legible en español
 */
export const formatCategoryLabel = (rawCategory?: string | null): string => {
  if (!rawCategory) return 'Espacio formativo';
  const norm = rawCategory.toLowerCase().trim();

  for (const cat of DIRECTORY_CATEGORIES) {
    if (cat.value === 'all') continue;
    if (cat.value === norm) return cat.label;
    if (cat.keywords.some((kw) => norm.includes(kw))) return cat.label;
  }

  // Capitalizar la primera letra si no coincide
  return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
};

/**
 * Evalúa si una organización pertenece a la categoría filtrada
 */
export const isCategoryMatched = (rawCategory: string | null | undefined, filterValue: string): boolean => {
  if (filterValue === 'all') return true;
  if (!rawCategory) return filterValue === 'other';

  const norm = rawCategory.toLowerCase().trim();
  const targetCat = DIRECTORY_CATEGORIES.find((c) => c.value === filterValue);
  if (!targetCat) return true;

  // Coincidencia directa por clave o por palabras clave del rubro
  if (targetCat.value === norm) return true;
  if (targetCat.keywords.some((kw) => norm.includes(kw))) return true;

  // Si se busca "other" (Otras actividades), coincide si no encaja en las disciplinas específicas principales
  if (filterValue === 'other') {
    const isSpecific = DIRECTORY_CATEGORIES.some(
      (c) => c.value !== 'all' && c.value !== 'other' && (c.value === norm || c.keywords.some((kw) => norm.includes(kw)))
    );
    return !isSpecific;
  }

  return false;
};
