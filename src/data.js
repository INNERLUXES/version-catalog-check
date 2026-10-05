// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const GRADLE = 'https://docs.gradle.org/current/userguide';
const ANDROID = 'https://developer.android.com';

export const SOURCES = [
  { id: 'gradleCatalogs', title: 'Version Catalogs (Gradle User Manual)', url: `${GRADLE}/version_catalogs.html` },
  { id: 'gradlePlatforms', title: 'Platforms (Gradle User Manual)', url: `${GRADLE}/platforms.html` },
  { id: 'gradleVersions', title: 'Declaring Versions and Ranges (Gradle User Manual)', url: `${GRADLE}/dependency_versions.html` },
  { id: 'gradleRepositories', title: 'Declaring Repositories (Gradle User Manual)', url: `${GRADLE}/declaring_repositories.html` },
  { id: 'gradleRepositoryTypes', title: 'Supported Repository Types (Gradle User Manual)', url: `${GRADLE}/supported_repository_types.html` },
  { id: 'gradleJcenter', title: 'JCenter shutdown impact on Gradle builds (Gradle blog)', url: 'https://blog.gradle.org/jcenter-shutdown' },
  { id: 'androidCatalogs', title: 'Migrate your build to version catalogs (Android Developers)', url: `${ANDROID}/build/migrate-to-catalogs` },
  { id: 'composeBom', title: 'Use a Bill of Materials (Jetpack Compose, Android Developers)', url: `${ANDROID}/develop/ui/compose/bom` },
  { id: 'firebaseBom', title: 'Learn more about Android and Firebase: the Firebase Android BoM (Firebase)', url: 'https://firebase.google.com/docs/android/learn-more' },
  { id: 'coroutines', title: 'kotlinx.coroutines (Kotlin on GitHub)', url: 'https://github.com/Kotlin/kotlinx.coroutines' },
  { id: 'androidxOverview', title: 'AndroidX overview (Android Developers)', url: `${ANDROID}/jetpack/androidx` },
  { id: 'androidxMigrate', title: 'Migrate to AndroidX (Android Developers)', url: `${ANDROID}/jetpack/androidx/migrate` },
  { id: 'viewBindingMigration', title: 'Migrate from Kotlin synthetics to Jetpack view binding (Android Developers)', url: `${ANDROID}/topic/libraries/view-binding/migration` },
  { id: 'kaptToKsp', title: 'Migrate from kapt to KSP (Android Developers)', url: `${ANDROID}/build/migrate-to-ksp` },
  { id: 'kspOverview', title: 'Kotlin Symbol Processing API: supported libraries (Kotlin documentation)', url: 'https://kotlinlang.org/docs/ksp-overview.html' },
  { id: 'toml', title: 'TOML v1.0.0 (toml.io)', url: 'https://toml.io/en/v1.0.0' },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  catalogTables: { source: 'gradleCatalogs', text: 'a catalog file has the tables versions, libraries, bundles and plugins, and Gradle reads gradle/libs.versions.toml as the catalog libs with no setting' },
  catalogAccessors: { source: 'gradleCatalogs', text: 'dashes and underscores in an alias become dots in the accessor, so the alias ktor-client-core is used as libs.ktor.client.core' },
  catalogForms: { source: 'gradleCatalogs', text: 'a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version' },
  catalogRich: { source: 'gradleCatalogs', text: 'a version in the catalog may be rich, with require, strictly, prefer, reject and rejectAll' },
  catalogSettings: { source: 'gradleCatalogs', text: 'more catalogs are declared in the settings file, under versionCatalogs, each created by name from a file' },
  catalogCentral: { source: 'androidCatalogs', text: 'a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors' },
  catalogNaming: { source: 'androidCatalogs', text: 'aliases in kebab case, such as androidx-ktx, give the best code completion, and a plugin from the catalog is applied with alias(libs.plugins...)' },
  platformBom: { source: 'gradlePlatforms', text: 'a platform, often published as a Maven BOM, aligns the versions of a set of modules, and once it is imported with platform() the modules of the set can be declared with no version' },
  catalogNotResolution: { source: 'gradlePlatforms', text: 'a catalog only names coordinates and versions; it does not take part in resolution, as a platform does' },
  dynamicForms: { source: 'gradleVersions', text: 'Gradle takes ranges such as [1.0,2.0), prefix versions such as 1.+, and the status versions latest.release and latest.integration' },
  dynamicUnreproducible: { source: 'gradleVersions', text: 'dynamic versions and changing modules can make builds that cannot be reproduced, and a new version may break the API, so locking is advised when they are used' },
  richMeaning: { source: 'gradleVersions', text: 'strictly is the strongest constraint, require allows a higher version, prefer applies only when nothing stronger is given, and reject excludes versions' },
  repositoriesDeclared: { source: 'gradleRepositories', text: 'repositories are declared in a repositories block, and Gradle looks for each dependency in them' },
  mavenLocalAvoid: { source: 'gradleRepositoryTypes', text: 'mavenLocal() should as a rule not be added to a build: the local Maven folder is a cache that can hold incomplete modules, its files can be overwritten, and Gradle does not cache it' },
  jcenterReadOnly: { source: 'gradleJcenter', text: 'JCenter takes no new packages and is kept read-only; Gradle advises moving to Maven Central and deprecates jcenter() for removal in a later major release' },
  composeBomUse: { source: 'composeBom', text: 'with the Compose BOM androidx.compose:compose-bom imported as a platform, the Compose libraries are declared with no version, and a version written on one of them overrides the BOM' },
  composeBomCatalog: { source: 'composeBom', text: 'in a catalog, the BOM gets a version and the Compose libraries are written with group and name and no version' },
  firebaseBomUse: { source: 'firebaseBom', text: 'with com.google.firebase:firebase-bom, the Firebase libraries are declared with no version, and a version that differs from the BoM is not advised when more than one Firebase library is used' },
  coroutinesBom: { source: 'coroutines', text: 'the kotlinx.coroutines project publishes a module kotlinx-coroutines-bom besides its libraries' },
  supportUnmaintained: { source: 'androidxOverview', text: 'the Support Library is no longer maintained, 28.0.0 was its last release, and all new work is in the androidx packages' },
  supportMapping: { source: 'androidxMigrate', text: 'the com.android.support artifacts and the android.arch packages moved to androidx, and the migration page lists the artifact for each' },
  syntheticsDeprecated: { source: 'viewBindingMigration', text: 'Kotlin Android Extensions is deprecated: the kotlin-android-extensions plugin is removed and view binding takes its place, with the kotlin-parcelize plugin for Parcelable' },
  kaptMaintenance: { source: 'kaptToKsp', text: 'kapt is in maintenance mode and KSP runs up to twice as fast; a processor that supports KSP is moved by adding the KSP plugin and changing kapt(...) to ksp(...)' },
  kspLibraries: { source: 'kspOverview', text: 'Room, Moshi, Glide and Dagger are among the libraries with KSP support' },
  tomlRules: { source: 'toml', text: 'a TOML key is defined once, an inline table stays on one line with no trailing comma, and an array may span lines' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the configuration reader of this tool refuses a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads the version catalogs and the Gradle files on disk as text and fetches nothing; it never says what the latest version of a library is. A finding is a lead with a file and a line, and a clean result is not a Gradle build and not a dependency resolution (docs/limits.md).';
