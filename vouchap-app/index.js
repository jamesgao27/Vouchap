// Polyfills must load before expo-router (and thus firm → spreadsheet-preview-pdf → jspdf).
import './polyfills/text-decoder-latin1';
// Do not import @react-native-async-storage/async-storage here: if the native module is missing,
// a top-level import throws a redbox. supabase.ts uses a guarded require + fallback instead.
import 'expo-router/entry';
