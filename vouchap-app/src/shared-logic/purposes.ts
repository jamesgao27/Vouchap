/**
 * @deprecated Use '@/lib/attributions' instead.
 * Kept for short-term compatibility during naming migration.
 */
export type { Attribution as Purpose } from './attributions';
export {
  getAttributions as getPurposes,
  createAttribution as createPurpose,
  updateAttribution as updatePurpose,
  deleteAttribution as deletePurpose,
  findAttributionByName as findPurposeByName,
} from './attributions';

