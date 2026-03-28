// Polyfills must load before expo-router (and thus firm → spreadsheet-preview-pdf → jspdf).
import './polyfills/text-decoder-latin1';
import 'expo-router/entry';
