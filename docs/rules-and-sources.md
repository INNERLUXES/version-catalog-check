# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change. The same points are in src/data.js and are shown by `--explain`;
research/sources.md has a longer note on each page. The tool reads the version catalogs and the Gradle files on disk as
text: a point says what a page says, and a finding says what a file holds. A clean result is not a Gradle build and not
a dependency resolution.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `invalid-catalog-entry` | error | `catalogTables`, `catalogForms`, `catalogAccessors` |
| `missing-version-ref` | error | `catalogForms`, `catalogTables` |
| `dynamic-version` | error | `dynamicForms`, `dynamicUnreproducible`, `richMeaning` |
| `duplicate-library` | error | `catalogCentral`, `catalogForms` |
| `version-conflict` | error | `catalogCentral`, `richMeaning` |
| `deprecated-coordinate` | error | `supportUnmaintained`, `supportMapping`, `syntheticsDeprecated` |
| `jcenter-repository` | error | `jcenterReadOnly`, `repositoriesDeclared` |
| `unused-catalog-entry` | warning | `catalogAccessors`, `catalogCentral`, `catalogNaming` |
| `unused-version` | warning | `catalogForms`, `catalogAccessors` |
| `hard-coded-dependency` | warning | `catalogCentral`, `catalogNaming` |
| `version-next-to-bom` | warning | `platformBom`, `composeBomUse`, `composeBomCatalog`, `firebaseBomUse`, `coroutinesBom` |
| `maven-local-repository` | warning | `mavenLocalAvoid`, `repositoriesDeclared` |
| `kapt-processor` | info | `kaptMaintenance`, `kspLibraries` |
| `unreadable-file` | error, always | `tomlRules`, `catalogSettings` |
| `scan-limit` | error, always | `tomlRules` |

### `invalid-catalog-entry`

A catalog entry Gradle cannot read.

- `catalogTables` (Version Catalogs (Gradle User Manual)): a catalog file has the tables versions, libraries, bundles and plugins, and Gradle reads gradle/libs.versions.toml as the catalog libs with no setting.
- `catalogForms` (Version Catalogs (Gradle User Manual)): a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version.
- `catalogAccessors` (Version Catalogs (Gradle User Manual)): dashes and underscores in an alias become dots in the accessor, so the alias ktor-client-core is used as libs.ktor.client.core.

The tool's own choice: a table other than versions, libraries, bundles, plugins and metadata; a library with no module and no group and name, or with a group or name that is not a coordinate; a plugin with no id; a version that is empty or not a string or a rich version; a bundle that names an alias that is not a library of the catalog; and two aliases that give the same accessor.

What to change: write the entry in one of the forms of the Gradle page on version catalogs, such as { module = "group:name", version.ref = "key" }.

### `missing-version-ref`

A version.ref names a key that [versions] does not have.

- `catalogForms` (Version Catalogs (Gradle User Manual)): a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version.
- `catalogTables` (Version Catalogs (Gradle User Manual)): a catalog file has the tables versions, libraries, bundles and plugins, and Gradle reads gradle/libs.versions.toml as the catalog libs with no setting.

The tool's own choice: a version.ref of a library or a plugin whose key is not in the [versions] table of the same catalog, compared as written.

What to change: add the key to [versions], or point version.ref at the key that holds the version.

### `dynamic-version`

A version lets Gradle pick a different version from one build to the next.

- `dynamicForms` (Declaring Versions and Ranges (Gradle User Manual)): Gradle takes ranges such as [1.0,2.0), prefix versions such as 1.+, and the status versions latest.release and latest.integration.
- `dynamicUnreproducible` (Declaring Versions and Ranges (Gradle User Manual)): dynamic versions and changing modules can make builds that cannot be reproduced, and a new version may break the API, so locking is advised when they are used.
- `richMeaning` (Declaring Versions and Ranges (Gradle User Manual)): strictly is the strongest constraint, require allows a higher version, prefer applies only when nothing stronger is given, and reject excludes versions.

The tool's own choice: a version that ends with + (1.+, +), starts with latest. (latest.release, latest.integration), or is a range such as [1.0,2.0) or ]1.0,2.0[, in [versions], in a library or plugin of a catalog, in a strictly, require or prefer of a rich version, or in a dependency string of a build file; a version.ref is reported once, at its key; reject is not read for this rule; -SNAPSHOT versions are not reported.

What to change: write the one version the build should use, such as 4.12.0, and change it on purpose when you update; if a range is needed, lock the resolved versions with Gradle dependency locking.

### `duplicate-library`

Two aliases of the catalogs name the same library.

- `catalogCentral` (Migrate your build to version catalogs (Android Developers)): a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors.
- `catalogForms` (Version Catalogs (Gradle User Manual)): a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version.

The tool's own choice: two libraries with the same group:name in the catalogs read, under different aliases; the second is reported, with the place of the first; the same module in two catalogs counts too.

What to change: keep one alias for the library, point every build file at it, and remove the other.

### `version-conflict`

The same library is declared with two different versions.

- `catalogCentral` (Migrate your build to version catalogs (Android Developers)): a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors.
- `richMeaning` (Declaring Versions and Ranges (Gradle User Manual)): strictly is the strongest constraint, require allows a higher version, prefer applies only when nothing stronger is given, and reject excludes versions.

The tool's own choice: one group:name written with two different versions across the catalogs and the dependency strings of the build files; a version.ref is followed to its key, a rich version stands for its strictly, else require, else prefer; dynamic versions and versions written with a variable are left out; each declaration after the first with a different version is reported, with the place of the first; which one Gradle picks depends on resolution, which the tool does not run.

What to change: declare the library once, in the catalog, with one version, and use the catalog accessor in every build file.

### `deprecated-coordinate`

A deprecated library or plugin is still declared.

- `supportUnmaintained` (AndroidX overview (Android Developers)): the Support Library is no longer maintained, 28.0.0 was its last release, and all new work is in the androidx packages.
- `supportMapping` (Migrate to AndroidX (Android Developers)): the com.android.support artifacts and the android.arch packages moved to androidx, and the migration page lists the artifact for each.
- `syntheticsDeprecated` (Migrate from Kotlin synthetics to Jetpack view binding (Android Developers)): Kotlin Android Extensions is deprecated: the kotlin-android-extensions plugin is removed and view binding takes its place, with the kotlin-parcelize plugin for Parcelable.

The tool's own choice: a library of a catalog or a dependency string of a build file that matches deprecatedLibraries (com.android.support:*, com.android.support.*:* and android.arch.*:* by default), and a plugin of a catalog or a plugin id of a build file in deprecatedPlugins (kotlin-android-extensions by default); a library declared in a catalog is reported there, once.

What to change: move to the replacement the message names, and remove the old coordinate or plugin.

### `jcenter-repository`

The build still reads from JCenter.

- `jcenterReadOnly` (JCenter shutdown impact on Gradle builds (Gradle blog)): JCenter takes no new packages and is kept read-only; Gradle advises moving to Maven Central and deprecates jcenter() for removal in a later major release.
- `repositoriesDeclared` (Declaring Repositories (Gradle User Manual)): repositories are declared in a repositories block, and Gradle looks for each dependency in them.

The tool's own choice: a call jcenter() in a settings or build file, outside comments and strings.

What to change: replace jcenter() with mavenCentral() and check that every dependency is found there.

### `unused-catalog-entry`

A catalog entry no build file uses.

- `catalogAccessors` (Version Catalogs (Gradle User Manual)): dashes and underscores in an alias become dots in the accessor, so the alias ktor-client-core is used as libs.ktor.client.core.
- `catalogCentral` (Migrate your build to version catalogs (Android Developers)): a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors.
- `catalogNaming` (Migrate your build to version catalogs (Android Developers)): aliases in kebab case, such as androidx-ktx, give the best code completion, and a plugin from the catalog is applied with alias(libs.plugins...).

The tool's own choice: a library, bundle or plugin whose accessor (libs.x.y, libs.bundles.x, libs.plugins.x, with dashes, underscores and dots all read as dots) appears in no Gradle file of the project, outside comments and strings; a library counts as used when a bundle that holds it is used; references from Kotlin or Java code outside Gradle files, such as convention plugins in build-logic, are not seen.

What to change: remove the entry when nothing uses it, or reference it where it is meant to be used.

### `unused-version`

A key of [versions] that nothing uses.

- `catalogForms` (Version Catalogs (Gradle User Manual)): a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version.
- `catalogAccessors` (Version Catalogs (Gradle User Manual)): dashes and underscores in an alias become dots in the accessor, so the alias ktor-client-core is used as libs.ktor.client.core.

The tool's own choice: a key of [versions] that no version.ref of the same catalog names and that no Gradle file reads as libs.versions.x.

What to change: remove the key, or point the library or plugin that should follow it at it with version.ref.

### `hard-coded-dependency`

A dependency is written with its version in a build file instead of the catalog.

- `catalogCentral` (Migrate your build to version catalogs (Android Developers)): a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors.
- `catalogNaming` (Migrate your build to version catalogs (Android Developers)): aliases in kebab case, such as androidx-ktx, give the best code completion, and a plugin from the catalog is applied with alias(libs.plugins...).

The tool's own choice: a string group:name:version in a dependency configuration of a build file (implementation, api, kapt, classpath and the like, inside platform() too); the message says when a catalog already has the library; group:name with no version, the map notation (group: ..., name: ...) and project(...) are not reported.

What to change: add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit).

### `version-next-to-bom`

A library that a BOM aligns is given a version of its own.

- `platformBom` (Platforms (Gradle User Manual)): a platform, often published as a Maven BOM, aligns the versions of a set of modules, and once it is imported with platform() the modules of the set can be declared with no version.
- `composeBomUse` (Use a Bill of Materials (Jetpack Compose, Android Developers)): with the Compose BOM androidx.compose:compose-bom imported as a platform, the Compose libraries are declared with no version, and a version written on one of them overrides the BOM.
- `composeBomCatalog` (Use a Bill of Materials (Jetpack Compose, Android Developers)): in a catalog, the BOM gets a version and the Compose libraries are written with group and name and no version.
- `firebaseBomUse` (Learn more about Android and Firebase: the Firebase Android BoM (Firebase)): with com.google.firebase:firebase-bom, the Firebase libraries are declared with no version, and a version that differs from the BoM is not advised when more than one Firebase library is used.
- `coroutinesBom` (kotlinx.coroutines (Kotlin on GitHub)): the kotlinx.coroutines project publishes a module kotlinx-coroutines-bom besides its libraries.

The tool's own choice: a library of a catalog or a dependency string of a build file that matches the libraries of an entry of boms and not its except, declared with a version, while the BOM of that entry is declared somewhere in the project (in a catalog or in a build file); whether the BOM is imported as a platform in the module that uses the library is not checked.

What to change: leave the version out and let the BOM choose it; if one library must differ on purpose, say why in a comment and set this rule to info.

### `maven-local-repository`

The build reads from the local Maven folder.

- `mavenLocalAvoid` (Supported Repository Types (Gradle User Manual)): mavenLocal() should as a rule not be added to a build: the local Maven folder is a cache that can hold incomplete modules, its files can be overwritten, and Gradle does not cache it.
- `repositoriesDeclared` (Declaring Repositories (Gradle User Manual)): repositories are declared in a repositories block, and Gradle looks for each dependency in them.

The tool's own choice: a call mavenLocal() in a settings or build file, outside comments and strings.

What to change: remove mavenLocal(); to build against a local change of a library, use a composite build (includeBuild).

### `kapt-processor`

An annotation processor runs with kapt although it has a KSP version.

- `kaptMaintenance` (Migrate from kapt to KSP (Android Developers)): kapt is in maintenance mode and KSP runs up to twice as fast; a processor that supports KSP is moved by adding the KSP plugin and changing kapt(...) to ksp(...).
- `kspLibraries` (Kotlin Symbol Processing API: supported libraries (Kotlin documentation)): Room, Moshi, Glide and Dagger are among the libraries with KSP support.

The tool's own choice: a dependency in kapt or a kapt configuration of a variant (kaptTest, kaptAndroidTest) on a processor of kspProcessors, as a string or through a catalog accessor; a suggestion only, because a module may need kapt for another processor, such as data binding.

What to change: apply the KSP plugin (com.google.devtools.ksp), change kapt(...) to ksp(...), and remove the kapt plugin once no processor needs it.

### `unreadable-file`

A catalog or a Gradle file that cannot be read.

- `tomlRules` (TOML v1.0.0 (toml.io)): a TOML key is defined once, an inline table stays on one line with no trailing comma, and an array may span lines.
- `catalogSettings` (Version Catalogs (Gradle User Manual)): more catalogs are declared in the settings file, under versionCatalogs, each created by name from a file.

The tool's own choice: a file over its size limit, a binary file, a file that is not valid UTF-8 or UTF-16 with its byte order mark, a catalog that is not TOML the reader takes, and a catalog the settings file names from a file that is not there; nothing in it is checked; this rule cannot be set lower or off.

What to change: save the file as UTF-8 and write the catalog as TOML, one key and value a line, with inline tables on one line.

### `scan-limit`

The input is larger than the limits of a run.

- `tomlRules` (TOML v1.0.0 (toml.io)): a TOML key is defined once, an inline table stays on one line with no trailing comma, and an array may span lines.

The tool's own choice: a project with more files, folders, Gradle files or catalog entries than the limits of docs/limits.md, or folders nested deeper; the rest is not read, so the run fails; this rule cannot be set lower or off.

What to change: exclude the folders that are not part of the build, or check the parts of the project in runs of their own.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `catalogTables` | Version Catalogs (Gradle User Manual) | a catalog file has the tables versions, libraries, bundles and plugins, and Gradle reads gradle/libs.versions.toml as the catalog libs with no setting |
| `catalogAccessors` | Version Catalogs (Gradle User Manual) | dashes and underscores in an alias become dots in the accessor, so the alias ktor-client-core is used as libs.ktor.client.core |
| `catalogForms` | Version Catalogs (Gradle User Manual) | a library is written as one string, with module, or with group and name, and its version is a string, a version.ref to the versions table, or a rich version |
| `catalogRich` | Version Catalogs (Gradle User Manual) | a version in the catalog may be rich, with require, strictly, prefer, reject and rejectAll |
| `catalogSettings` | Version Catalogs (Gradle User Manual) | more catalogs are declared in the settings file, under versionCatalogs, each created by name from a file |
| `catalogCentral` | Migrate your build to version catalogs (Android Developers) | a catalog keeps the names and versions of dependencies and plugins in one file, in place of names and versions written in each build file, and modules use them through type-safe accessors |
| `catalogNaming` | Migrate your build to version catalogs (Android Developers) | aliases in kebab case, such as androidx-ktx, give the best code completion, and a plugin from the catalog is applied with alias(libs.plugins...) |
| `platformBom` | Platforms (Gradle User Manual) | a platform, often published as a Maven BOM, aligns the versions of a set of modules, and once it is imported with platform() the modules of the set can be declared with no version |
| `catalogNotResolution` | Platforms (Gradle User Manual) | a catalog only names coordinates and versions; it does not take part in resolution, as a platform does |
| `dynamicForms` | Declaring Versions and Ranges (Gradle User Manual) | Gradle takes ranges such as [1.0,2.0), prefix versions such as 1.+, and the status versions latest.release and latest.integration |
| `dynamicUnreproducible` | Declaring Versions and Ranges (Gradle User Manual) | dynamic versions and changing modules can make builds that cannot be reproduced, and a new version may break the API, so locking is advised when they are used |
| `richMeaning` | Declaring Versions and Ranges (Gradle User Manual) | strictly is the strongest constraint, require allows a higher version, prefer applies only when nothing stronger is given, and reject excludes versions |
| `repositoriesDeclared` | Declaring Repositories (Gradle User Manual) | repositories are declared in a repositories block, and Gradle looks for each dependency in them |
| `mavenLocalAvoid` | Supported Repository Types (Gradle User Manual) | mavenLocal() should as a rule not be added to a build: the local Maven folder is a cache that can hold incomplete modules, its files can be overwritten, and Gradle does not cache it |
| `jcenterReadOnly` | JCenter shutdown impact on Gradle builds (Gradle blog) | JCenter takes no new packages and is kept read-only; Gradle advises moving to Maven Central and deprecates jcenter() for removal in a later major release |
| `composeBomUse` | Use a Bill of Materials (Jetpack Compose, Android Developers) | with the Compose BOM androidx.compose:compose-bom imported as a platform, the Compose libraries are declared with no version, and a version written on one of them overrides the BOM |
| `composeBomCatalog` | Use a Bill of Materials (Jetpack Compose, Android Developers) | in a catalog, the BOM gets a version and the Compose libraries are written with group and name and no version |
| `firebaseBomUse` | Learn more about Android and Firebase: the Firebase Android BoM (Firebase) | with com.google.firebase:firebase-bom, the Firebase libraries are declared with no version, and a version that differs from the BoM is not advised when more than one Firebase library is used |
| `coroutinesBom` | kotlinx.coroutines (Kotlin on GitHub) | the kotlinx.coroutines project publishes a module kotlinx-coroutines-bom besides its libraries |
| `supportUnmaintained` | AndroidX overview (Android Developers) | the Support Library is no longer maintained, 28.0.0 was its last release, and all new work is in the androidx packages |
| `supportMapping` | Migrate to AndroidX (Android Developers) | the com.android.support artifacts and the android.arch packages moved to androidx, and the migration page lists the artifact for each |
| `syntheticsDeprecated` | Migrate from Kotlin synthetics to Jetpack view binding (Android Developers) | Kotlin Android Extensions is deprecated: the kotlin-android-extensions plugin is removed and view binding takes its place, with the kotlin-parcelize plugin for Parcelable |
| `kaptMaintenance` | Migrate from kapt to KSP (Android Developers) | kapt is in maintenance mode and KSP runs up to twice as fast; a processor that supports KSP is moved by adding the KSP plugin and changing kapt(...) to ksp(...) |
| `kspLibraries` | Kotlin Symbol Processing API: supported libraries (Kotlin documentation) | Room, Moshi, Glide and Dagger are among the libraries with KSP support |
| `tomlRules` | TOML v1.0.0 (toml.io) | a TOML key is defined once, an inline table stays on one line with no trailing comma, and an array may span lines |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the configuration reader of this tool refuses a repeated name |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

| Page | Address |
| --- | --- |
| Version Catalogs (Gradle User Manual) | https://docs.gradle.org/current/userguide/version_catalogs.html |
| Platforms (Gradle User Manual) | https://docs.gradle.org/current/userguide/platforms.html |
| Declaring Versions and Ranges (Gradle User Manual) | https://docs.gradle.org/current/userguide/dependency_versions.html |
| Declaring Repositories (Gradle User Manual) | https://docs.gradle.org/current/userguide/declaring_repositories.html |
| Supported Repository Types (Gradle User Manual) | https://docs.gradle.org/current/userguide/supported_repository_types.html |
| JCenter shutdown impact on Gradle builds (Gradle blog) | https://blog.gradle.org/jcenter-shutdown |
| Migrate your build to version catalogs (Android Developers) | https://developer.android.com/build/migrate-to-catalogs |
| Use a Bill of Materials (Jetpack Compose, Android Developers) | https://developer.android.com/develop/ui/compose/bom |
| Learn more about Android and Firebase: the Firebase Android BoM (Firebase) | https://firebase.google.com/docs/android/learn-more |
| kotlinx.coroutines (Kotlin on GitHub) | https://github.com/Kotlin/kotlinx.coroutines |
| AndroidX overview (Android Developers) | https://developer.android.com/jetpack/androidx |
| Migrate to AndroidX (Android Developers) | https://developer.android.com/jetpack/androidx/migrate |
| Migrate from Kotlin synthetics to Jetpack view binding (Android Developers) | https://developer.android.com/topic/libraries/view-binding/migration |
| Migrate from kapt to KSP (Android Developers) | https://developer.android.com/build/migrate-to-ksp |
| Kotlin Symbol Processing API: supported libraries (Kotlin documentation) | https://kotlinlang.org/docs/ksp-overview.html |
| TOML v1.0.0 (toml.io) | https://toml.io/en/v1.0.0 |
| RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | https://www.rfc-editor.org/rfc/rfc4180 |
| RFC 8259, The JSON Data Interchange Format | https://www.rfc-editor.org/rfc/rfc8259 |
| CSV Injection (OWASP) | https://community.owasp.org/attacks/CSV_Injection |
| Workflow commands for GitHub Actions (GitHub Docs) | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
