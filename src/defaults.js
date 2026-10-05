// The built-in configuration: the level of every rule, the BOMs and the libraries each one aligns, the coordinates and
// plugins that are deprecated, the annotation processors that have a KSP version, the paths left out, the lowest level
// shown and the level that fails the run. docs/inputs.md describes every key, and --print-defaults writes the
// configuration out.

// The level of every rule that the configuration can set. The two rules of input problems are always errors.
export const DEFAULT_RULES = {
  invalidCatalogEntry: 'error',
  missingVersionRef: 'error',
  dynamicVersion: 'error',
  duplicateLibrary: 'error',
  versionConflict: 'error',
  deprecatedCoordinate: 'error',
  jcenterRepository: 'error',
  unusedCatalogEntry: 'warning',
  unusedVersion: 'warning',
  hardCodedDependency: 'warning',
  versionNextToBom: 'warning',
  mavenLocalRepository: 'warning',
  kaptProcessor: 'info'
};

// The BOMs the tool knows: when the BOM is declared anywhere in the project (in a catalog or a build file), a library
// it aligns that is declared with a version of its own is reported. libraries and except are coordinate patterns
// group:name, where * is any run of characters. The Compose compiler is not part of the Compose BOM, and the Gradle
// plugins of Firebase are not part of the Firebase BoM, so they are left out.
export const DEFAULT_BOMS = [
  { bom: 'androidx.compose:compose-bom', libraries: ['androidx.compose.*:*'], except: ['androidx.compose.compiler:*'] },
  { bom: 'com.google.firebase:firebase-bom', libraries: ['com.google.firebase:*'], except: ['com.google.firebase:*-gradle', 'com.google.firebase:perf-plugin'] },
  { bom: 'org.jetbrains.kotlinx:kotlinx-coroutines-bom', libraries: ['org.jetbrains.kotlinx:kotlinx-coroutines-*'], except: [] }
];

// Coordinates that are deprecated, with what to use instead. match is a coordinate pattern group:name.
export const DEFAULT_DEPRECATED_LIBRARIES = [
  { match: 'com.android.support:*', use: 'the AndroidX artifact (androidx.*) that the AndroidX migration page lists for it; the Support Library is no longer maintained' },
  { match: 'com.android.support.*:*', use: 'the AndroidX artifact (androidx.*) that the AndroidX migration page lists for it; the Support Library is no longer maintained' },
  { match: 'android.arch.*:*', use: 'the androidx artifact that took its place, such as androidx.lifecycle or androidx.room' }
];

// Plugin ids that are deprecated, with what to use instead.
export const DEFAULT_DEPRECATED_PLUGINS = [
  { id: 'kotlin-android-extensions', use: 'view binding (android.buildFeatures.viewBinding) for views, and the kotlin-parcelize plugin for @Parcelize' },
  { id: 'org.jetbrains.kotlin.android.extensions', use: 'view binding (android.buildFeatures.viewBinding) for views, and the kotlin-parcelize plugin for @Parcelize' }
];

// Annotation processors that also run with KSP, as group:name. A kapt dependency on one of them is reported as a
// suggestion.
export const DEFAULT_KSP_PROCESSORS = ['androidx.room:room-compiler', 'com.github.bumptech.glide:compiler', 'com.squareup.moshi:moshi-kotlin-codegen', 'com.google.dagger:dagger-compiler', 'com.google.dagger:hilt-compiler'];

// Paths of the project that are not read, as patterns relative to the project folder. None by default; the folders
// build, .gradle and .git are never read.
export const DEFAULT_EXCLUDE = [];

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
